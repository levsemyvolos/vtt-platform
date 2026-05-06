import { createSlice, createAsyncThunk, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type { AssetDTO } from '@vtt/shared';
import {
  listRoomAssets,
  uploadImageAsset,
  renameAsset as apiRenameAsset,
  getAssetById,
} from '../api/assets';
import type { RootState } from './index';

/**
 * Asset library cache. Two-layer:
 *   - byId: full DTO indexed by asset UUID. Used everywhere a component
 *     needs to render an asset (canvas image, thumbnail, audio source).
 *     This handles the case where an asset reaches the page via a scene/token
 *     reference *before* the room-level list is loaded (mid-session join).
 *   - byRoom: ordered lists of asset IDs for the asset library UI.
 *
 * Signed URL refresh: each AssetDTO.url has a 4h TTL. When a 403 fires on
 * /api/assets/:id/file, components should dispatch fetchAsset(id) to swap
 * the entry in byId for a fresh signed URL — no need to refetch the whole
 * room list.
 */

interface AssetsState {
  byId: Record<string, AssetDTO>;
  byRoom: Record<string, string[]>;
  loadingRooms: Record<string, boolean>;
  error: string | null;
}

const initialState: AssetsState = {
  byId: {},
  byRoom: {},
  loadingRooms: {},
  error: null,
};

function toErrorKey(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.startsWith('errors:')) return err.message;
  return fallback;
}

// ─────────────────────────────────────────────────────────────
// Thunks
// ─────────────────────────────────────────────────────────────

export const fetchRoomAssets = createAsyncThunk<
  { roomId: string; assets: AssetDTO[] },
  string,
  { rejectValue: string }
>('assets/fetchRoom', async (roomId, { rejectWithValue }) => {
  try {
    const assets = await listRoomAssets(roomId);
    return { roomId, assets };
  } catch (err) {
    return rejectWithValue(toErrorKey(err, 'errors:asset.loadFailed'));
  }
});

export const fetchAsset = createAsyncThunk<AssetDTO, string, { rejectValue: string }>(
  'assets/fetchOne',
  async (assetId, { rejectWithValue }) => {
    try {
      return await getAssetById(assetId);
    } catch (err) {
      return rejectWithValue(toErrorKey(err, 'errors:asset.loadFailed'));
    }
  },
);

export const uploadAsset = createAsyncThunk<
  AssetDTO,
  { roomId: string; file: File },
  { rejectValue: string }
>('assets/upload', async ({ roomId, file }, { rejectWithValue }) => {
  try {
    return await uploadImageAsset(roomId, file);
  } catch (err) {
    return rejectWithValue(toErrorKey(err, 'errors:asset.uploadFailed'));
  }
});

export const renameAsset = createAsyncThunk<
  AssetDTO,
  { id: string; name: string },
  { rejectValue: string }
>('assets/rename', async ({ id, name }, { rejectWithValue }) => {
  try {
    return await apiRenameAsset(id, name);
  } catch (err) {
    return rejectWithValue(toErrorKey(err, 'errors:asset.renameFailed'));
  }
});

// ─────────────────────────────────────────────────────────────
// Slice
// ─────────────────────────────────────────────────────────────

const assetsSlice = createSlice({
  name: 'assets',
  initialState,
  reducers: {
    /** Server-pushed insert (e.g. WebSocket asset:created) — keeps cache in sync. */
    upsertAsset(state, action: PayloadAction<AssetDTO>) {
      const a = action.payload;
      state.byId[a.id] = a;
      const list = (state.byRoom[a.roomId] ??= []);
      if (!list.includes(a.id)) list.unshift(a.id);
    },
    removeAsset(state, action: PayloadAction<string>) {
      const id = action.payload;
      const a = state.byId[id];
      if (!a) return;
      delete state.byId[id];
      const list = state.byRoom[a.roomId];
      if (list) state.byRoom[a.roomId] = list.filter((x) => x !== id);
    },
    clearRoomAssets(state, action: PayloadAction<string>) {
      const roomId = action.payload;
      const ids = state.byRoom[roomId] ?? [];
      for (const id of ids) delete state.byId[id];
      delete state.byRoom[roomId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoomAssets.pending, (state, action) => {
        state.loadingRooms[action.meta.arg] = true;
        state.error = null;
      })
      .addCase(fetchRoomAssets.fulfilled, (state, action) => {
        const { roomId, assets } = action.payload;
        state.loadingRooms[roomId] = false;
        state.byRoom[roomId] = assets.map((a) => a.id);
        for (const a of assets) state.byId[a.id] = a;
      })
      .addCase(fetchRoomAssets.rejected, (state, action) => {
        state.loadingRooms[action.meta.arg] = false;
        state.error = action.payload ?? 'errors:network.generic';
      })
      .addCase(fetchAsset.fulfilled, (state, action) => {
        state.byId[action.payload.id] = action.payload;
      })
      .addCase(uploadAsset.fulfilled, (state, action) => {
        const a = action.payload;
        state.byId[a.id] = a;
        const list = (state.byRoom[a.roomId] ??= []);
        if (!list.includes(a.id)) list.unshift(a.id);
      })
      .addCase(renameAsset.fulfilled, (state, action) => {
        state.byId[action.payload.id] = action.payload;
      });
  },
});

export const { upsertAsset, removeAsset, clearRoomAssets } = assetsSlice.actions;
export default assetsSlice.reducer;

// ─────────────────────────────────────────────────────────────
// Memoized selectors
// ─────────────────────────────────────────────────────────────

const selectByRoom = (state: RootState) => state.assets.byRoom;
const selectById = (state: RootState) => state.assets.byId;

/** Returns AssetDTO[] for a room, in insertion order (newest first). Memoized. */
export const makeSelectRoomAssets = (roomId: string) =>
  createSelector(
    [selectByRoom, selectById],
    (byRoom, byId): AssetDTO[] => {
      const ids = byRoom[roomId] ?? [];
      const out: AssetDTO[] = [];
      for (const id of ids) {
        const a = byId[id];
        if (a) out.push(a);
      }
      return out;
    },
  );

/** Returns one AssetDTO by id, or undefined. */
export const selectAssetById = (assetId: string | null | undefined) =>
  (state: RootState): AssetDTO | undefined =>
    assetId ? state.assets.byId[assetId] : undefined;

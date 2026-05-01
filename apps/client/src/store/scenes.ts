import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { SceneDTO, CreateSceneRequest } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';

interface ScenesState {
  list: SceneDTO[];
  status: 'idle' | 'loading' | 'error';
  error: string | null;
}

const initialState: ScenesState = {
  list: [],
  status: 'idle',
  error: null,
};

function toErrorKey(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.startsWith('errors:')) return err.message;
  return fallback;
}

export const loadScenes = createAsyncThunk<SceneDTO[], string, { rejectValue: string }>(
  'scenes/load',
  async (roomId, { rejectWithValue }) => {
    try {
      return await apiFetch<SceneDTO[]>(`/api/rooms/${roomId}/scenes`);
    } catch (err) {
      return rejectWithValue(toErrorKey(err, 'errors:scene.loadFailed'));
    }
  },
);

export const createScene = createAsyncThunk<
  SceneDTO,
  { roomId: string; dto: CreateSceneRequest },
  { rejectValue: string }
>('scenes/create', async ({ roomId, dto }, { rejectWithValue }) => {
  try {
    return await apiFetch<SceneDTO>(`/api/rooms/${roomId}/scenes`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  } catch (err) {
    return rejectWithValue(toErrorKey(err, 'errors:network.createFailed'));
  }
});

// On rejection we re-load scenes from the server: an aborted activate (race
// with a quick remount) may have already succeeded server-side, so the UI must
// reflect actual DB state rather than stale Redux.
export const activateScene = createAsyncThunk<void, string, { rejectValue: string; state: { scenes: ScenesState } }>(
  'scenes/activate',
  async (sceneId, { rejectWithValue, dispatch, getState }) => {
    try {
      await apiFetch<void>(`/api/scenes/${sceneId}/activate`, { method: 'POST' });
    } catch (err) {
      // Find the room from the scene we tried to activate, to re-fetch its list.
      const target = getState().scenes.list.find((s) => s.id === sceneId);
      if (target) void dispatch(loadScenes(target.roomId));
      return rejectWithValue(toErrorKey(err, 'errors:scene.activateFailed'));
    }
  },
);

const scenesSlice = createSlice({
  name: 'scenes',
  initialState,
  reducers: {
    clearScenes: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadScenes.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadScenes.fulfilled, (state, action) => {
        state.status = 'idle';
        state.list = action.payload;
      })
      .addCase(loadScenes.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'errors:network.generic';
      })
      .addCase(createScene.fulfilled, (state, action) => {
        state.list.push(action.payload);
      })
      .addCase(activateScene.fulfilled, (state, action) => {
        const sceneId = action.meta.arg;
        for (const s of state.list) {
          s.isActive = s.id === sceneId;
        }
      });
  },
});

export const { clearScenes } = scenesSlice.actions;
export default scenesSlice.reducer;

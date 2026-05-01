import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  SceneDTO,
  TokenPublicDTO,
  SceneUpdatedPayload,
  TokenRollbackPayload,
  FogMaskDiffPayload,
} from '@vtt/shared';
import { xorPackedMasks } from '../components/GameCanvas/fogMask';

interface SceneState {
  current: SceneDTO | null;
  /**
   * Monotonic OCC version of the latest known SceneUpdate (algorithm A2).
   * The client sends this as `clientSeq` on the next token:move.
   */
  version: number;
  /**
   * Optimistic-move snapshots indexed by tokenId so a rollback can restore
   * the pre-drag position without round-tripping the server again.
   */
  pendingMoves: Record<string, { x: number; y: number }>;
  /** Selected token id for the SceneEditor properties panel. */
  selectedTokenId: string | null;
}

const initialState: SceneState = {
  current: null,
  version: 0,
  pendingMoves: {},
  selectedTokenId: null,
};

const sceneSlice = createSlice({
  name: 'scene',
  initialState,
  reducers: {
    hydrateScene: (state, action: PayloadAction<SceneDTO>) => {
      state.current = action.payload;
      // version of the "newest" token in the snapshot — used as clientSeq baseline
      state.version = action.payload.tokens.reduce(
        (acc, t) => (t.version > acc ? t.version : acc),
        0,
      );
      state.pendingMoves = {};
    },
    clearScene: (state) => {
      state.current = null;
      state.version = 0;
      state.pendingMoves = {};
    },
    /** Optimistic move issued from the UI before the server replies. */
    moveTokenOptimistic: (
      state,
      action: PayloadAction<{ tokenId: string; x: number; y: number }>,
    ) => {
      if (!state.current) return;
      const token = state.current.tokens.find((t) => t.id === action.payload.tokenId);
      if (!token) return;
      state.pendingMoves[action.payload.tokenId] = { x: token.x, y: token.y };
      token.x = action.payload.x;
      token.y = action.payload.y;
    },
    applySceneUpdate: (state, action: PayloadAction<SceneUpdatedPayload>) => {
      if (!state.current) return;
      state.current.tokens = action.payload.tokens;
      state.version = action.payload.version;
      // any token included in the update no longer has a pending optimistic move
      for (const t of action.payload.tokens) {
        delete state.pendingMoves[t.id];
      }
    },
    applyTokenRollback: (state, action: PayloadAction<TokenRollbackPayload>) => {
      if (!state.current) return;
      const token = state.current.tokens.find((t) => t.id === action.payload.tokenId);
      if (token) {
        token.x = action.payload.x;
        token.y = action.payload.y;
        token.version = action.payload.version;
      }
      delete state.pendingMoves[action.payload.tokenId];
      if (action.payload.version > state.version) state.version = action.payload.version;
    },
    upsertToken: (state, action: PayloadAction<TokenPublicDTO>) => {
      if (!state.current) return;
      const idx = state.current.tokens.findIndex((t) => t.id === action.payload.id);
      if (idx === -1) state.current.tokens.push(action.payload);
      else state.current.tokens[idx] = action.payload;
    },
    removeToken: (state, action: PayloadAction<string>) => {
      if (!state.current) return;
      state.current.tokens = state.current.tokens.filter((t) => t.id !== action.payload);
    },
    /**
     * Algorithm A4 trigger A (§2.17.5): GM modified the fog mask. Server emits
     * an XOR diff against the previously broadcast packed bitmap; the client
     * XORs it onto `current.fogMaskBase64` to obtain the new mask without
     * re-fetching the full snapshot.
     */
    applyFogDiff: (state, action: PayloadAction<FogMaskDiffPayload>) => {
      if (!state.current) return;
      if (state.current.id !== action.payload.sceneId) return;
      state.current.fogMaskBase64 = xorPackedMasks(
        state.current.fogMaskBase64,
        action.payload.diffBase64,
      );
    },
    selectToken: (state, action: PayloadAction<string>) => {
      state.selectedTokenId = action.payload;
    },
    deselectToken: (state) => {
      state.selectedTokenId = null;
    },
    clearFogMask: (state) => {
      if (state.current) state.current.fogMaskBase64 = null;
    },
  },
});

export const {
  hydrateScene,
  clearScene,
  moveTokenOptimistic,
  applySceneUpdate,
  applyTokenRollback,
  upsertToken,
  removeToken,
  applyFogDiff,
  selectToken,
  deselectToken,
  clearFogMask,
} = sceneSlice.actions;
export default sceneSlice.reducer;

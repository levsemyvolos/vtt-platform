import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AnnotationPingPayload, MeasurePayload } from '@vtt/shared';

interface AnnotationsState {
  /** Ephemeral pings currently visible on the canvas. Removed after 3 s via socket.ts. */
  activePings: AnnotationPingPayload[];
  /** Ephemeral ruler lines currently visible on the canvas. Keyed by userId. Auto-fade 5 s. */
  activeMeasures: MeasurePayload[];
  /**
   * Ephemeral live token-drag positions, keyed by tokenId. Populated from the
   * `token:drag-preview` broadcast (Sess 5.5 Mini-D). Used by TokenLayer to
   * render a smooth drag visualization on remote viewers between the discrete
   * `scene:updated` frames. Cleared shortly after the last update arrives.
   */
  tokenDragPreviews: Record<string, { x: number; y: number }>;
}

const initialState: AnnotationsState = {
  activePings: [],
  activeMeasures: [],
  tokenDragPreviews: {},
};

const annotationsSlice = createSlice({
  name: 'annotations',
  initialState,
  reducers: {
    addPing(state, action: PayloadAction<AnnotationPingPayload>) {
      state.activePings.push(action.payload);
    },
    removePing(state, action: PayloadAction<number>) {
      state.activePings = state.activePings.filter((p) => p.timestamp !== action.payload);
    },
    upsertMeasure(state, action: PayloadAction<MeasurePayload>) {
      const idx = state.activeMeasures.findIndex((m) => m.userId === action.payload.userId);
      if (idx >= 0) {
        state.activeMeasures[idx] = action.payload;
      } else {
        state.activeMeasures.push(action.payload);
      }
    },
    removeMeasure(state, action: PayloadAction<string>) {
      state.activeMeasures = state.activeMeasures.filter((m) => m.userId !== action.payload);
    },
    upsertTokenDragPreview(
      state,
      action: PayloadAction<{ tokenId: string; x: number; y: number }>,
    ) {
      const { tokenId, x, y } = action.payload;
      state.tokenDragPreviews[tokenId] = { x, y };
    },
    removeTokenDragPreview(state, action: PayloadAction<string>) {
      delete state.tokenDragPreviews[action.payload];
    },
  },
});

export const {
  addPing,
  removePing,
  upsertMeasure,
  removeMeasure,
  upsertTokenDragPreview,
  removeTokenDragPreview,
} = annotationsSlice.actions;
export default annotationsSlice.reducer;

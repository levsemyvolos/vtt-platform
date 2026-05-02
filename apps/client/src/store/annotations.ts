import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AnnotationPingPayload, MeasurePayload } from '@vtt/shared';

interface AnnotationsState {
  /** Ephemeral pings currently visible on the canvas. Removed after 3 s via socket.ts. */
  activePings: AnnotationPingPayload[];
  /** Ephemeral ruler lines currently visible on the canvas. Keyed by userId. Auto-fade 5 s. */
  activeMeasures: MeasurePayload[];
}

const initialState: AnnotationsState = { activePings: [], activeMeasures: [] };

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
  },
});

export const { addPing, removePing, upsertMeasure, removeMeasure } = annotationsSlice.actions;
export default annotationsSlice.reducer;

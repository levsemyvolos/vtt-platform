import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AnnotationPingPayload } from '@vtt/shared';

interface AnnotationsState {
  /** Ephemeral pings currently visible on the canvas. Removed after 3 s via socket.ts. */
  activePings: AnnotationPingPayload[];
}

const initialState: AnnotationsState = { activePings: [] };

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
  },
});

export const { addPing, removePing } = annotationsSlice.actions;
export default annotationsSlice.reducer;

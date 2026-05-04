import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type CanvasTool = 'select' | 'ping' | 'ruler' | 'draw' | 'fog' | 'text' | 'image';

interface CanvasViewportState {
  zoom: number;
  activeTool: CanvasTool;
  pendingImageAssetId: string | null;
}

const initialState: CanvasViewportState = {
  zoom: 1,
  activeTool: 'select',
  pendingImageAssetId: null,
};

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

function clamp(v: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(v.toFixed(4))));
}

const canvasViewportSlice = createSlice({
  name: 'canvasViewport',
  initialState,
  reducers: {
    setZoom(state, action: PayloadAction<number>) {
      state.zoom = clamp(action.payload);
    },
    zoomIn(state) {
      state.zoom = clamp(state.zoom * ZOOM_STEP);
    },
    zoomOut(state) {
      state.zoom = clamp(state.zoom / ZOOM_STEP);
    },
    center(state) {
      state.zoom = 1;
    },
    fit(state) {
      state.zoom = 1;
    },
    setActiveTool(state, action: PayloadAction<CanvasTool>) {
      state.activeTool = action.payload;
    },
    setPendingImageAssetId(state, action: PayloadAction<string | null>) {
      state.pendingImageAssetId = action.payload;
    },
    resetTool(state) {
      state.activeTool = 'select';
    },
  },
});

export const { setZoom, zoomIn, zoomOut, center, fit, setActiveTool, setPendingImageAssetId, resetTool } =
  canvasViewportSlice.actions;
export default canvasViewportSlice.reducer;

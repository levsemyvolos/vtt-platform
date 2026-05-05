import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type CanvasTool = 'select' | 'ping' | 'ruler' | 'draw' | 'fog' | 'text' | 'image';

export type FogMode = 'hide' | 'reveal';

interface CanvasViewportState {
  zoom: number;
  activeTool: CanvasTool;
  pendingImageAssetId: string | null;
  fogMode: FogMode;
  /** GM-only fog opacity (0..1). Players always see fog at full strength. */
  fogGmAlpha: number;
}

const initialState: CanvasViewportState = {
  zoom: 1,
  activeTool: 'select',
  pendingImageAssetId: null,
  fogMode: 'hide',
  fogGmAlpha: 0.55,
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
    setFogMode(state, action: PayloadAction<FogMode>) {
      state.fogMode = action.payload;
    },
    setFogGmAlpha(state, action: PayloadAction<number>) {
      state.fogGmAlpha = Math.max(0, Math.min(1, action.payload));
    },
  },
});

export const {
  setZoom, zoomIn, zoomOut, center, fit, setActiveTool, setPendingImageAssetId, resetTool,
  setFogMode, setFogGmAlpha,
} = canvasViewportSlice.actions;
export default canvasViewportSlice.reducer;

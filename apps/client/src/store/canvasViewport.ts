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
  /** Brush size for the draw tool in px (Sess 7, 4β). Persisted per-user in localStorage. */
  brushSize: number;
}

const BRUSH_SIZE_MIN = 1;
const BRUSH_SIZE_MAX = 32;
const BRUSH_SIZE_DEFAULT = 3;
const BRUSH_SIZE_KEY = 'vtt:brushSize';

function readPersistedBrushSize(): number {
  if (typeof window === 'undefined') return BRUSH_SIZE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(BRUSH_SIZE_KEY);
    if (raw === null) return BRUSH_SIZE_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return BRUSH_SIZE_DEFAULT;
    return Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, parsed));
  } catch {
    return BRUSH_SIZE_DEFAULT;
  }
}

function persistBrushSize(value: number): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(BRUSH_SIZE_KEY, String(value)); } catch { /* ignore quota */ }
}

const initialState: CanvasViewportState = {
  zoom: 1,
  activeTool: 'select',
  pendingImageAssetId: null,
  fogMode: 'hide',
  fogGmAlpha: 0.55,
  brushSize: readPersistedBrushSize(),
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
    /** Sets the draw-tool brush size and persists to localStorage (Sess 7, 4β). */
    setBrushSize(state, action: PayloadAction<number>) {
      const next = Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, Math.round(action.payload)));
      state.brushSize = next;
      persistBrushSize(next);
    },
  },
});

export const BRUSH_SIZE_BOUNDS = { min: BRUSH_SIZE_MIN, max: BRUSH_SIZE_MAX, default: BRUSH_SIZE_DEFAULT } as const;

export const {
  setZoom, zoomIn, zoomOut, center, fit, setActiveTool, setPendingImageAssetId, resetTool,
  setFogMode, setFogGmAlpha, setBrushSize,
} = canvasViewportSlice.actions;
export default canvasViewportSlice.reducer;

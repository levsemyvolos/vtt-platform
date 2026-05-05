import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  SceneDTO,
  TokenPublicDTO,
  SceneUpdatedPayload,
  TokenRollbackPayload,
  FogShape,
  FogShapeAddPayload,
  FogShapeRemovePayload,
  DrawStrokePayload,
  SceneAnnotations,
} from '@vtt/shared';

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
      if (action.payload.annotations) {
        state.current.annotations = action.payload.annotations;
      }
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
    /** A GM added a new pixel-precise fog rectangle (Ф3.3, shape-list). */
    fogShapeAdded: (state, action: PayloadAction<FogShapeAddPayload>) => {
      if (!state.current || state.current.id !== action.payload.sceneId) return;
      const shapes = state.current.fogShapes ?? [];
      if (shapes.some((s) => s.id === action.payload.shape.id)) return;
      shapes.push(action.payload.shape);
      shapes.sort((a, b) => a.createdAt - b.createdAt);
      state.current.fogShapes = shapes;
    },
    fogShapeRemoved: (state, action: PayloadAction<FogShapeRemovePayload>) => {
      if (!state.current || state.current.id !== action.payload.sceneId) return;
      state.current.fogShapes = (state.current.fogShapes ?? []).filter(
        (s) => s.id !== action.payload.shapeId,
      );
    },
    fogShapesSet: (state, action: PayloadAction<FogShape[]>) => {
      if (!state.current) return;
      state.current.fogShapes = [...action.payload].sort((a, b) => a.createdAt - b.createdAt);
    },
    selectToken: (state, action: PayloadAction<string>) => {
      state.selectedTokenId = action.payload;
    },
    deselectToken: (state) => {
      state.selectedTokenId = null;
    },
    clearFogMask: (state) => {
      if (state.current) state.current.fogShapes = [];
    },
    moveSceneObjectOptimistic: (
      state,
      action: PayloadAction<{ objectId: string; x: number; y: number }>,
    ) => {
      if (!state.current) return;
      const annotations = state.current.annotations;
      annotations.objects = (annotations.objects ?? []).map((object) => (
        object.id === action.payload.objectId
          ? { ...object, x: action.payload.x, y: action.payload.y }
          : object
      ));
      annotations.texts = annotations.texts.map((text) => (
        text.id === action.payload.objectId ? { ...text, x: action.payload.x, y: action.payload.y } : text
      ));
      annotations.images = annotations.images.map((image) => (
        image.id === action.payload.objectId ? { ...image, x: action.payload.x, y: action.payload.y } : image
      ));
      annotations.strokes = annotations.strokes.map((stroke) => (
        stroke.strokeId === action.payload.objectId ? { ...stroke, x: action.payload.x, y: action.payload.y } : stroke
      ));
    },
    /** Adds or updates a draw stroke in the local scene state (Ф3.4.2). */
    applyDrawStroke: (state, action: PayloadAction<DrawStrokePayload>) => {
      if (!state.current) return;
      const { strokeId, userId, points, color, width } = action.payload;
      const strokes = state.current.annotations.strokes;
      const idx = strokes.findIndex((a) => a.strokeId === strokeId);
      const stroke = { strokeId, userId, points, color, width };
      if (idx >= 0) strokes[idx] = stroke;
      else strokes.push(stroke);
      const objects = state.current.annotations.objects ?? [];
      const objectIdx = objects.findIndex((object) => object.id === strokeId);
      const existing = objectIdx >= 0 ? objects[objectIdx] : undefined;
      const object = {
        id: strokeId,
        type: 'stroke' as const,
        userId,
        x: existing?.x ?? 0,
        y: existing?.y ?? 0,
        zIndex: existing?.zIndex ?? objects.length,
        points,
        color,
        strokeWidth: width,
      };
      if (objectIdx >= 0) objects[objectIdx] = object;
      else objects.push(object);
      state.current.annotations.objects = objects;
    },
    /** Clears all draw strokes from the local scene state (GM draw:clear). */
    clearDrawStrokes: (state) => {
      if (!state.current) return;
      state.current.annotations.strokes = [];
      state.current.annotations.objects = (state.current.annotations.objects ?? []).filter((object) => object.type !== 'stroke');
    },
    /** Replaces full annotations from server broadcast (annotations:updated event). */
    applyAnnotationsUpdate: (
      state,
      action: PayloadAction<{ sceneId: string; annotations: SceneAnnotations }>,
    ) => {
      if (!state.current || state.current.id !== action.payload.sceneId) return;
      state.current.annotations = action.payload.annotations;
    },
    removeSceneObject: (state, action: PayloadAction<string>) => {
      if (!state.current) return;
      const id = action.payload;
      state.current.annotations.texts = state.current.annotations.texts.filter((t) => t.id !== id);
      state.current.annotations.images = state.current.annotations.images.filter((i) => i.id !== id);
      state.current.annotations.strokes = state.current.annotations.strokes.filter((s) => s.strokeId !== id);
      state.current.annotations.objects = (state.current.annotations.objects ?? []).filter((o) => o.id !== id);
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
  fogShapeAdded,
  fogShapeRemoved,
  fogShapesSet,
  selectToken,
  deselectToken,
  clearFogMask,
  moveSceneObjectOptimistic,
  applyDrawStroke,
  clearDrawStrokes,
  removeSceneObject,
  applyAnnotationsUpdate,
} = sceneSlice.actions;
export default sceneSlice.reducer;

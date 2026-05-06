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
  SceneObject,
  SceneObjectLayer,
  SceneObjectVisibility,
} from '@vtt/shared';

/** Keys that can be buffered locally during Edit Scene mode. */
interface SceneDraftPatch {
  gridSize?: number;
  gridWidth?: number;
  gridHeight?: number;
  gridVisible?: boolean;
  backgroundAssetId?: string;
  backgroundFit?: 'cover' | 'contain' | 'stretch';
  backgroundOffsetX?: number;
  backgroundOffsetY?: number;
  backgroundScale?: number;
}

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
  /** Selected scene object ids (multi-select, Sess 3 Mini-C). */
  selectedSceneObjectIds: string[];
  /** Buffered scene-level edits (gridSize/gridWidth/gridHeight/gridVisible/backgroundAssetId/
   * backgroundFit/backgroundOffsetX/backgroundOffsetY/backgroundScale)
   * accumulated during Edit Scene. Flushed by EditorTopBar.handleDone via a single
   * PATCH /scenes/:id call. Reset to null on hydrate/clear/handleDone success. */
  draftPatch: SceneDraftPatch | null;
}

const initialState: SceneState = {
  current: null,
  version: 0,
  pendingMoves: {},
  selectedTokenId: null,
  selectedSceneObjectIds: [],
  draftPatch: null,
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
      state.selectedSceneObjectIds = [];
      state.draftPatch = null;
    },
    clearScene: (state) => {
      state.current = null;
      state.version = 0;
      state.pendingMoves = {};
      state.selectedSceneObjectIds = [];
      state.draftPatch = null;
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
        layer: (existing?.layer ?? 'overlay') as import('@vtt/shared').SceneObjectLayer,
        visibility: (existing?.visibility ?? 'all') as import('@vtt/shared').SceneObjectVisibility,
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
      if (state.selectedSceneObjectIds.includes(id)) {
        state.selectedSceneObjectIds = state.selectedSceneObjectIds.filter((s) => s !== id);
      }
    },
    /**
     * Select a scene object (Sess 3 Mini-C).
     * Payload: string id (legacy) or { id, additive? }.
     * additive=true → toggle membership in selectedSceneObjectIds.
     * additive=false/absent → replace selection with single id.
     */
    selectSceneObject: (
      state,
      action: PayloadAction<string | { id: string; additive?: boolean }>,
    ) => {
      const normalized =
        typeof action.payload === 'string'
          ? { id: action.payload, additive: false }
          : action.payload;
      const { id, additive } = normalized;
      if (additive) {
        if (state.selectedSceneObjectIds.includes(id)) {
          state.selectedSceneObjectIds = state.selectedSceneObjectIds.filter((s) => s !== id);
        } else {
          state.selectedSceneObjectIds = [...state.selectedSceneObjectIds, id];
        }
      } else {
        state.selectedSceneObjectIds = [id];
      }
    },
    /** Clear all selected scene objects (Sess 3 Mini-C). */
    deselectSceneObject: (state) => {
      state.selectedSceneObjectIds = [];
    },
    /**
     * Optimistic transform (reposition + resize + rotate) applied before server confirms (Sess 2).
     * Includes x/y because Konva Transformer can reposition the Group during corner-resize and
     * rotation, which would cause Player-side desync if only width/height/rotation were stored (Sess 2.5).
     * Mutates BOTH objects[] AND images[] mirror so subsequent moves don't drop rotation (RED 1).
     * Idempotent: re-dispatching same values is a no-op.
     */
    transformSceneObjectOptimistic: (
      state,
      action: PayloadAction<{ objectId: string; x: number; y: number; width: number; height: number; rotation: number }>,
    ) => {
      if (!state.current) return;
      const { objectId, x, y, width, height, rotation } = action.payload;
      const annotations = state.current.annotations;
      annotations.objects = (annotations.objects ?? []).map((object) => (
        object.id === objectId
          ? { ...object, x, y, width, height, rotation }
          : object
      ));
      annotations.images = annotations.images.map((image) => (
        image.id === objectId
          ? { ...image, x, y, width, height, rotation }
          : image
      ));
    },
    /**
     * Toggles the locked flag on a scene object (Sess 3 Mini-B).
     * Mirrors to images[] when the object is of image type.
     * Idempotent — re-dispatching the same value is a no-op.
     */
    lockSceneObject: (
      state,
      action: PayloadAction<{ objectId: string; locked: boolean }>,
    ) => {
      if (!state.current) return;
      const { objectId, locked } = action.payload;
      const annotations = state.current.annotations;
      annotations.objects = (annotations.objects ?? []).map((object) => (
        object.id === objectId ? { ...object, locked } : object
      ));
      annotations.images = annotations.images.map((image) => (
        image.id === objectId ? { ...image, locked } : image
      ));
    },
    /**
     * Changes the zIndex of a scene object relative to peers (Sess 3 Mini-B).
     * Mirrors the server SceneAnnotationService.setZIndex algorithm exactly
     * so optimistic + broadcast paths yield identical state.
     *
     * direction='front' → target.zIndex = max(peerZIndices) + 1.
     * direction='back'  → target.zIndex = min(peerZIndices) - 1.
     * Edge case: no peers (single object) → zIndex unchanged.
     * Negative zIndex is allowed — it is a sort key only; no normalization.
     */
    setSceneObjectZIndex: (
      state,
      action: PayloadAction<{ objectId: string; direction: 'front' | 'back' }>,
    ) => {
      if (!state.current) return;
      const { objectId, direction } = action.payload;
      const objects = state.current.annotations.objects ?? [];
      const obj = objects.find((o) => o.id === objectId);
      if (!obj) return;

      const peerZIndices = objects.filter((o) => o.id !== objectId).map((o) => o.zIndex);

      let newZIndex = obj.zIndex;
      if (peerZIndices.length > 0) {
        if (direction === 'front') {
          newZIndex = Math.max(...peerZIndices) + 1;
        } else {
          newZIndex = Math.min(...peerZIndices) - 1;
        }
      }

      state.current.annotations.objects = objects.map((candidate) => (
        candidate.id === objectId ? { ...candidate, zIndex: newZIndex } : candidate
      ));
    },
    /**
     * Appends a new SceneObject to the scene (Sess 3 Mini-B).
     * Used for `object:duplicated` broadcasts.
     *
     * Idempotency: if an object with the same id already exists it is replaced,
     * so both optimistic and broadcast paths hitting the same client are safe.
     *
     * Mirrors to the appropriate legacy array (images[], texts[], strokes[])
     * per the server duplicateObject mirror logic.
     */
    appendSceneObject: (
      state,
      action: PayloadAction<SceneObject>,
    ) => {
      if (!state.current) return;
      const object = action.payload;
      const annotations = state.current.annotations;
      const objects = annotations.objects ?? [];

      const existingIdx = objects.findIndex((o) => o.id === object.id);
      if (existingIdx >= 0) {
        objects[existingIdx] = object;
      } else {
        objects.push(object);
      }
      state.current.annotations.objects = objects;

      if (object.type === 'image') {
        const imgIdx = annotations.images.findIndex((i) => i.id === object.id);
        const imageBase = {
          id: object.id,
          userId: object.userId,
          x: object.x,
          y: object.y,
          assetId: object.assetId,
          width: object.width,
          height: object.height,
        };
        // exactOptionalPropertyTypes: only include optional fields when defined
        const imageEntry = object.rotation !== undefined
          ? object.locked !== undefined
            ? { ...imageBase, rotation: object.rotation, locked: object.locked }
            : { ...imageBase, rotation: object.rotation }
          : object.locked !== undefined
            ? { ...imageBase, locked: object.locked }
            : imageBase;
        if (imgIdx >= 0) {
          annotations.images[imgIdx] = imageEntry;
        } else {
          annotations.images.push(imageEntry);
        }
      } else if (object.type === 'text') {
        const textIdx = annotations.texts.findIndex((t) => t.id === object.id);
        const textEntry = {
          id: object.id,
          userId: object.userId,
          x: object.x,
          y: object.y,
          text: object.text,
          fontSize: object.fontSize,
          color: object.color,
        };
        if (textIdx >= 0) {
          annotations.texts[textIdx] = textEntry;
        } else {
          annotations.texts.push(textEntry);
        }
      } else if (object.type === 'stroke') {
        const strokeIdx = annotations.strokes.findIndex((s) => s.strokeId === object.id);
        const strokeEntry = {
          strokeId: object.id,
          userId: object.userId,
          x: object.x,
          y: object.y,
          points: object.points,
          color: object.color,
          width: object.strokeWidth,
        };
        if (strokeIdx >= 0) {
          annotations.strokes[strokeIdx] = strokeEntry;
        } else {
          annotations.strokes.push(strokeEntry);
        }
      }
    },
    /**
     * Changes the render layer of a scene object (Sess 5 Mini-B).
     * Mirrors to the appropriate legacy array per type so both objects[] and
     * the type-specific array stay in sync.
     */
    setSceneObjectLayer: (
      state,
      action: PayloadAction<{ objectId: string; layer: SceneObjectLayer }>,
    ) => {
      if (!state.current) return;
      const { objectId, layer } = action.payload;
      const obj = state.current.annotations.objects?.find((o) => o.id === objectId);
      if (obj) obj.layer = layer;
      const targetImage = state.current.annotations.images.find((i) => i.id === objectId);
      if (targetImage) targetImage.layer = layer;
      const targetText = state.current.annotations.texts.find((t) => t.id === objectId);
      if (targetText) targetText.layer = layer;
      const targetStroke = state.current.annotations.strokes.find((s) => s.strokeId === objectId);
      if (targetStroke) targetStroke.layer = layer;
    },
    /**
     * Changes the RBAC visibility of a scene object (Sess 5 Mini-B).
     * Player-side behavior: when `visibility` becomes 'gm-only' and `viewerIsGM`
     * is false, the object is REMOVED from all local arrays (objects[], images[],
     * texts[], strokes[]) and deselected. GM and the 'all' path just update the flag.
     */
    setSceneObjectVisibility: (
      state,
      action: PayloadAction<{ objectId: string; visibility: SceneObjectVisibility; viewerIsGM: boolean }>,
    ) => {
      if (!state.current) return;
      const { objectId, visibility, viewerIsGM } = action.payload;
      if (visibility === 'gm-only' && !viewerIsGM) {
        state.current.annotations.objects = (state.current.annotations.objects ?? []).filter(
          (o) => o.id !== objectId,
        );
        state.current.annotations.images = state.current.annotations.images.filter(
          (i) => i.id !== objectId,
        );
        state.current.annotations.texts = state.current.annotations.texts.filter(
          (t) => t.id !== objectId,
        );
        state.current.annotations.strokes = state.current.annotations.strokes.filter(
          (s) => s.strokeId !== objectId,
        );
        if (state.selectedSceneObjectIds.includes(objectId)) {
          state.selectedSceneObjectIds = state.selectedSceneObjectIds.filter(
            (id) => id !== objectId,
          );
        }
        return;
      }
      // GM viewing or visibility flipping back to 'all' — just update the flag.
      const obj = state.current.annotations.objects?.find((o) => o.id === objectId);
      if (obj) obj.visibility = visibility;
      const targetImage = state.current.annotations.images.find((i) => i.id === objectId);
      if (targetImage) targetImage.visibility = visibility;
      const targetText = state.current.annotations.texts.find((t) => t.id === objectId);
      if (targetText) targetText.visibility = visibility;
      const targetStroke = state.current.annotations.strokes.find((s) => s.strokeId === objectId);
      if (targetStroke) targetStroke.visibility = visibility;
    },
    /**
     * Buffer a scene-level patch locally during Edit Scene mode (Mini-A).
     * Merges into draftPatch (later apply of the same key overrides earlier).
     * Also mirrors relevant fields into current so the canvas re-renders immediately.
     * When backgroundUrl is supplied, current.backgroundUrl is updated so the GM
     * sees the new background at once (server canonical URL is re-derived on flush).
     * No-op when state.current is null.
     */
    applyDraftSceneUpdate: (
      state,
      action: PayloadAction<{
        patch: SceneDraftPatch;
        /** Locally-known signed URL for the new background asset (optional). */
        backgroundUrl?: string;
      }>,
    ) => {
      if (!state.current) return;
      state.draftPatch = { ...(state.draftPatch ?? {}), ...action.payload.patch };
      const { patch } = action.payload;
      if (patch.gridSize !== undefined) state.current.gridSize = patch.gridSize;
      if (patch.gridWidth !== undefined) state.current.gridWidth = patch.gridWidth;
      if (patch.gridHeight !== undefined) state.current.gridHeight = patch.gridHeight;
      if (patch.gridVisible !== undefined) state.current.gridVisible = patch.gridVisible;
      if (patch.backgroundFit !== undefined) state.current.backgroundFit = patch.backgroundFit;
      if (patch.backgroundOffsetX !== undefined) state.current.backgroundOffsetX = patch.backgroundOffsetX;
      if (patch.backgroundOffsetY !== undefined) state.current.backgroundOffsetY = patch.backgroundOffsetY;
      if (patch.backgroundScale !== undefined) state.current.backgroundScale = patch.backgroundScale;
      if (action.payload.backgroundUrl !== undefined) {
        state.current.backgroundUrl = action.payload.backgroundUrl;
      }
    },
    /** Reset the buffered draft patch to null (called by Cancel handler or after Done flush). */
    clearDraftSceneUpdate: (state) => {
      state.draftPatch = null;
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
  selectSceneObject,
  deselectSceneObject,
  transformSceneObjectOptimistic,
  lockSceneObject,
  setSceneObjectZIndex,
  appendSceneObject,
  setSceneObjectLayer,
  setSceneObjectVisibility,
  applyDraftSceneUpdate,
  clearDraftSceneUpdate,
} = sceneSlice.actions;
export default sceneSlice.reducer;

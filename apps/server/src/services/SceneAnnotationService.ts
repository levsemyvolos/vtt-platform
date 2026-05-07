import { randomUUID } from 'crypto';
import type {
  TextAnnotation,
  ImageAnnotation,
  SceneAnnotations,
  SceneObject,
  SceneObjectLayer,
  SceneObjectVisibility,
} from '@vtt/shared';
import { normalizeAnnotations, type DrawService } from './DrawService.js';
import { HttpError } from '../lib/errors.js';
import type { PrismaClient } from '@prisma/client';

export interface TransformPayload {
  x: number;
  y: number;
  rotation: number;
  /** Image-only — bounding-box dimensions. */
  width?: number;
  height?: number;
  /** Stroke-only — matrix scale factors (Sess 7, β). */
  scaleX?: number;
  scaleY?: number;
  /** Text-only — new font size in px (Sess 7, α). */
  fontSize?: number;
}

/** Clamp helpers for type-specific transform fields (Sess 7). */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;
const STROKE_SCALE_MIN = 0.1;
const STROKE_SCALE_MAX = 10;

function clampFontSize(v: number | undefined, fallback: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(v)));
}

function clampScale(v: number | undefined, fallback: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.max(STROKE_SCALE_MIN, Math.min(STROKE_SCALE_MAX, v));
}

/**
 * Manages pinned text (Ф3.4.4) and image (Ф3.4.5) canvas annotations.
 *
 * Both are GM-only. Stored alongside draw strokes in Scene.annotations JSONB
 * via DrawService (shared cache). After each mutation the service returns
 * the updated annotations; broadcasting is handled by the caller (handler).
 */
export class SceneAnnotationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly drawService: DrawService,
  ) {}

  async addText(
    sceneId: string,
    userId: string,
    payload: { x: number; y: number; text: string; fontSize?: number; color?: string; layer?: SceneObjectLayer },
  ): Promise<SceneAnnotations> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const layer: SceneObjectLayer = payload.layer ?? 'overlay';
    const visibility: SceneObjectVisibility = 'all';
    const entry: TextAnnotation = {
      id: randomUUID(),
      userId,
      x: payload.x,
      y: payload.y,
      text: payload.text,
      fontSize: payload.fontSize ?? 16,
      color: payload.color ?? '#ffffff',
      layer,
      visibility,
    };
    annotations.texts.push(entry);
    annotations.objects = [
      ...(annotations.objects ?? []),
      {
        id: entry.id,
        type: 'text',
        userId,
        x: entry.x,
        y: entry.y,
        zIndex: annotations.objects?.length ?? annotations.texts.length - 1,
        text: entry.text,
        fontSize: entry.fontSize,
        color: entry.color,
        layer,
        visibility,
      },
    ];
    await this.drawService.persist(sceneId, annotations);
    return annotations;
  }

  async addImage(
    sceneId: string,
    userId: string,
    payload: { x: number; y: number; assetId: string; width?: number; height?: number; layer?: SceneObjectLayer },
  ): Promise<SceneAnnotations> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const layer: SceneObjectLayer = payload.layer ?? 'tile';
    const visibility: SceneObjectVisibility = 'all';
    // Sess 8: width/height are now expected from the client (computed via the
    // shared imageDimensions helper that loads natural size + clamps to
    // MAX_INITIAL_DIMENSION). Defaults retained as a safety net for legacy
    // callers; under normal flow both are always provided.
    const entry: ImageAnnotation = {
      id: randomUUID(),
      userId,
      x: payload.x,
      y: payload.y,
      assetId: payload.assetId,
      width: payload.width ?? 256,
      height: payload.height ?? 256,
      layer,
      visibility,
    };
    annotations.images.push(entry);
    annotations.objects = [
      ...(annotations.objects ?? []),
      {
        id: entry.id,
        type: 'image',
        userId,
        x: entry.x,
        y: entry.y,
        zIndex: annotations.objects?.length ?? annotations.images.length - 1,
        assetId: entry.assetId,
        width: entry.width,
        height: entry.height,
        layer,
        visibility,
      },
    ];
    await this.drawService.persist(sceneId, annotations);
    return annotations;
  }

  /**
   * Insert-or-replace a SceneObject by id (Sess 7.5 — used for undo of delete and
   * for restoring strokes after draw_stroke undo→redo). Mirrors to the appropriate
   * legacy array (images[]/texts[]/strokes[]) so a normalize round-trip preserves
   * everything.
   */
  async upsertObject(
    sceneId: string,
    role: string,
    object: SceneObject,
  ): Promise<SceneAnnotations> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can upsert annotations');
    const annotations = await this.drawService.getAnnotations(sceneId);
    const objects = annotations.objects ?? [];
    const idx = objects.findIndex((o) => o.id === object.id);
    if (idx >= 0) objects[idx] = object; else objects.push(object);
    annotations.objects = objects;
    mirrorUpsertedObjectToLegacy(annotations, object);
    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  async moveAnnotation(
    sceneId: string,
    annotationId: string,
    userId: string,
    role: string,
    payload: { x: number; y: number },
  ): Promise<SceneAnnotations> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const object = (annotations.objects ?? []).find((candidate) => candidate.id === annotationId);
    const owner = object?.userId ?? findLegacyOwner(annotations, annotationId);
    assertCanMutateAnnotation(owner, userId, role, 'move');

    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === annotationId
        ? { ...candidate, x: payload.x, y: payload.y }
        : candidate
    ));
    annotations.texts = annotations.texts.map((text) => (
      text.id === annotationId ? { ...text, x: payload.x, y: payload.y } : text
    ));
    annotations.images = annotations.images.map((image) => (
      image.id === annotationId ? { ...image, x: payload.x, y: payload.y } : image
    ));
    annotations.strokes = annotations.strokes.map((stroke) => (
      stroke.strokeId === annotationId ? { ...stroke, x: payload.x, y: payload.y } : stroke
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  async removeAnnotation(
    sceneId: string,
    annotationId: string,
    userId: string,
    role: string,
  ): Promise<SceneAnnotations> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const removal = findAnnotationRemoval(annotations, annotationId);
    assertCanMutateAnnotation(removal.owner, userId, role, 'delete');
    if (removal.textIdx >= 0) annotations.texts.splice(removal.textIdx, 1);
    if (removal.imageIdx >= 0) annotations.images.splice(removal.imageIdx, 1);
    if (removal.strokeIdx >= 0) annotations.strokes.splice(removal.strokeIdx, 1);
    annotations.objects = (annotations.objects ?? []).filter((candidate) => candidate.id !== annotationId);
    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  /**
   * Resize/rotate/scale a SceneObject (Sess 2 image, extended Sess 7 to text & stroke).
   *
   * RBAC: GM-only.
   * Type-specific behavior:
   *  - image:  width/height clamped to [gridSize, gridWidth*gridSize] (Sess 2 baked dimensions)
   *  - text:   fontSize clamped to [8, 200]; bounding box derived by Konva at render (1α)
   *  - stroke: scaleX/scaleY clamped to [0.1, 10]; points[] unchanged — non-destructive matrix (2β)
   * Rotation is normalized to [0, 360).
   * x/y are passed through as-is (overlays may legitimately be off-screen).
   * Mirrors image mutations to images[] (RED 1 fix from Sess 2.5).
   */
  async transformObject(
    sceneId: string,
    objectId: string,
    role: string,
    payload: TransformPayload,
  ): Promise<SceneAnnotations> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can transform annotations');

    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: { gridSize: true, gridWidth: true, gridHeight: true },
    });
    if (!scene) throw new HttpError(404, 'Scene not found');

    const annotations = await this.drawService.getAnnotations(sceneId);
    const target = this.findTransformTarget(annotations, objectId);
    if (!target) throw new HttpError(404, 'Annotation not found');

    const newRotation = ((payload.rotation % 360) + 360) % 360;
    const baseUpdate = { x: payload.x, y: payload.y, rotation: newRotation };

    if (target.type === 'image') {
      this.applyImageTransform(annotations, objectId, baseUpdate, payload, scene);
    } else if (target.type === 'text') {
      this.applyTextTransform(annotations, objectId, baseUpdate, payload, target);
    } else {
      this.applyStrokeTransform(annotations, objectId, baseUpdate, payload, target);
    }

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  /** Locates the SceneObject by id across objects[]/images[] mirrors (Sess 7 helper). */
  private findTransformTarget(annotations: SceneAnnotations, objectId: string): SceneObject | null {
    const fromObjects = (annotations.objects ?? []).find((o) => o.id === objectId);
    if (fromObjects) return fromObjects;
    const fromImages = annotations.images.find((img) => img.id === objectId);
    if (fromImages) {
      // Legacy image annotation without a mirrored objects[] entry — treat as image type.
      return {
        id: fromImages.id,
        type: 'image',
        userId: fromImages.userId,
        x: fromImages.x,
        y: fromImages.y,
        width: fromImages.width,
        height: fromImages.height,
        assetId: fromImages.assetId,
        zIndex: 0,
        layer: fromImages.layer ?? 'tile',
        visibility: fromImages.visibility ?? 'all',
      };
    }
    return null;
  }

  /** Image transform: bake width/height into bounding box (Sess 2). */
  private applyImageTransform(
    annotations: SceneAnnotations,
    objectId: string,
    base: { x: number; y: number; rotation: number },
    payload: TransformPayload,
    scene: { gridSize: number; gridWidth: number; gridHeight: number },
  ): void {
    const minSize = scene.gridSize;
    const maxWidth = scene.gridWidth * scene.gridSize;
    const maxHeight = scene.gridHeight * scene.gridSize;
    // Sess 7: fall back to the existing image's dimensions when the payload omits
    // width/height (e.g. rotation-only updates from "Reset transform"). Falling back
    // to maxWidth/maxHeight here would silently resize the image to the entire grid.
    const existing = annotations.images.find((img) => img.id === objectId);
    const fallbackW = existing?.width ?? maxWidth;
    const fallbackH = existing?.height ?? maxHeight;
    const w = payload.width ?? fallbackW;
    const h = payload.height ?? fallbackH;
    const newWidth = Math.max(minSize, Math.min(maxWidth, Math.round(w)));
    const newHeight = Math.max(minSize, Math.min(maxHeight, Math.round(h)));
    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId && candidate.type === 'image'
        ? { ...candidate, ...base, width: newWidth, height: newHeight }
        : candidate
    ));
    annotations.images = annotations.images.map((image) => (
      image.id === objectId
        ? { ...image, ...base, width: newWidth, height: newHeight }
        : image
    ));
  }

  /** Text transform: scale fontSize (1α) and apply rotation (Sess 7). */
  private applyTextTransform(
    annotations: SceneAnnotations,
    objectId: string,
    base: { x: number; y: number; rotation: number },
    payload: TransformPayload,
    target: SceneObject,
  ): void {
    const fallback = target.type === 'text' ? target.fontSize : 16;
    const fontSize = clampFontSize(payload.fontSize, fallback);
    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId && candidate.type === 'text'
        ? { ...candidate, ...base, fontSize }
        : candidate
    ));
    annotations.texts = annotations.texts.map((text) => (
      text.id === objectId
        ? { ...text, x: base.x, y: base.y, fontSize }
        : text
    ));
  }

  /** Stroke transform: matrix scale + rotation, points[] unchanged (2β). */
  private applyStrokeTransform(
    annotations: SceneAnnotations,
    objectId: string,
    base: { x: number; y: number; rotation: number },
    payload: TransformPayload,
    target: SceneObject,
  ): void {
    const fallbackSx = target.type === 'stroke' ? (target.scaleX ?? 1) : 1;
    const fallbackSy = target.type === 'stroke' ? (target.scaleY ?? 1) : 1;
    const scaleX = clampScale(payload.scaleX, fallbackSx);
    const scaleY = clampScale(payload.scaleY, fallbackSy);
    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId && candidate.type === 'stroke'
        ? { ...candidate, ...base, scaleX, scaleY }
        : candidate
    ));
  }
  /**
   * Toggles the locked flag on a scene object (Sess 3).
   *
   * RBAC: GM-only (enforced by caller/handler).
   * Mirrors mutation to images[] if the object is of image type so that
   * subsequent normalizeAnnotations round-trips preserve the lock state.
   */
  async lockObject(
    sceneId: string,
    objectId: string,
    role: string,
    locked: boolean,
  ): Promise<SceneAnnotations> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can lock annotations');

    const annotations = await this.drawService.getAnnotations(sceneId);
    const obj = (annotations.objects ?? []).find((o) => o.id === objectId);
    if (!obj) throw new HttpError(404, 'Object not found');

    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId ? { ...candidate, locked } : candidate
    ));

    // Mirror to images[] so normalizeAnnotations preserves the flag
    annotations.images = annotations.images.map((image) => (
      image.id === objectId ? { ...image, locked } : image
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  /**
   * Changes the zIndex of a scene object relative to peers (Sess 3).
   *
   * direction='front' → target.zIndex = max(peer zIndices) + 1.
   * direction='back'  → target.zIndex = min(peer zIndices) - 1.
   * Negative zIndex is allowed — it is a sort key only; no normalization.
   * Edge case: if there are no peers (single object), zIndex is unchanged.
   *
   * RBAC: GM-only (enforced by caller/handler).
   */
  async setZIndex(
    sceneId: string,
    objectId: string,
    role: string,
    direction: 'front' | 'back',
  ): Promise<SceneAnnotations> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can change z-order');

    const annotations = await this.drawService.getAnnotations(sceneId);
    const objects = annotations.objects ?? [];
    const obj = objects.find((o) => o.id === objectId);
    if (!obj) throw new HttpError(404, 'Object not found');

    const peerZIndices = objects.filter((o) => o.id !== objectId).map((o) => o.zIndex);

    let newZIndex = obj.zIndex;
    if (peerZIndices.length > 0) {
      if (direction === 'front') {
        newZIndex = Math.max(...peerZIndices) + 1;
      } else {
        newZIndex = Math.min(...peerZIndices) - 1;
      }
    }
    // If no peers: no-op — zIndex unchanged (single object has no relative order)

    annotations.objects = objects.map((candidate): SceneObject => (
      candidate.id === objectId ? { ...candidate, zIndex: newZIndex } : candidate
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  /**
   * Creates a deep copy of a scene object offset by (+20, +20) (Sess 3).
   *
   * The duplicate is assigned a new UUID and placed on top (zIndex = max+1).
   * Mirror entries are created in the appropriate legacy array (images[], texts[], strokes[]).
   * Returns both the updated annotations and the newly created SceneObject for broadcast.
   *
   * RBAC: GM-only (enforced by caller/handler).
   */
  async duplicateObject(
    sceneId: string,
    objectId: string,
    role: string,
  ): Promise<{ annotations: SceneAnnotations; newObject: SceneObject }> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can duplicate annotations');

    const annotations = await this.drawService.getAnnotations(sceneId);
    const objects = annotations.objects ?? [];
    const src = objects.find((o) => o.id === objectId);
    if (!src) throw new HttpError(404, 'Object not found');

    const allZIndices = objects.map((o) => o.zIndex);
    const topZIndex = allZIndices.length > 0 ? Math.max(...allZIndices) + 1 : 0;
    const newId = randomUUID();

    const newObject: SceneObject = { ...src, id: newId, x: src.x + 20, y: src.y + 20, zIndex: topZIndex };

    annotations.objects = [...objects, newObject];
    this.mirrorLegacy(annotations, src, objectId, newId);

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);

    // Return the exact newObject before normalization so the id matches
    return { annotations: normalized, newObject };
  }

  /** Mirrors a duplicated object into the appropriate legacy array (images/texts/strokes).
   *  Extracted from duplicateObject to keep cyclomatic complexity ≤ 10 (lint gate). */
  private mirrorLegacy(
    annotations: SceneAnnotations,
    src: SceneObject,
    objectId: string,
    newId: string,
  ): void {
    if (src.type === 'image') {
      const imgSrc = annotations.images.find((img) => img.id === objectId);
      if (imgSrc) {
        annotations.images = [...annotations.images, { ...imgSrc, id: newId, x: imgSrc.x + 20, y: imgSrc.y + 20 }];
      }
    } else if (src.type === 'text') {
      const textSrc = annotations.texts.find((t) => t.id === objectId);
      if (textSrc) {
        annotations.texts = [...annotations.texts, { ...textSrc, id: newId, x: textSrc.x + 20, y: textSrc.y + 20 }];
      }
    } else if (src.type === 'stroke') {
      // For strokes: strokeId is used as the id in the legacy array
      const strokeSrc = annotations.strokes.find((s) => s.strokeId === objectId);
      if (strokeSrc) {
        annotations.strokes = [...annotations.strokes, { ...strokeSrc, strokeId: newId, x: (strokeSrc.x ?? 0) + 20, y: (strokeSrc.y ?? 0) + 20 }];
      }
    }
  }

  /**
   * Changes the render layer of a scene object (Sess 5 Mini-A).
   *
   * RBAC: GM-only.
   * Mirrors mutation to the appropriate legacy array entry.
   */
  async setObjectLayer(
    sceneId: string,
    objectId: string,
    role: string,
    layer: SceneObjectLayer,
  ): Promise<SceneAnnotations> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can change object layer');

    const annotations = await this.drawService.getAnnotations(sceneId);
    const obj = (annotations.objects ?? []).find((o) => o.id === objectId);
    if (!obj) throw new HttpError(404, 'Object not found');

    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId ? { ...candidate, layer } : candidate
    ));

    // Mirror to legacy arrays
    annotations.images = annotations.images.map((image) => (
      image.id === objectId ? { ...image, layer } : image
    ));
    annotations.texts = annotations.texts.map((text) => (
      text.id === objectId ? { ...text, layer } : text
    ));
    annotations.strokes = annotations.strokes.map((stroke) => (
      stroke.strokeId === objectId ? { ...stroke, layer } : stroke
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }

  /**
   * Changes the RBAC visibility of a scene object (Sess 5 Mini-A).
   *
   * RBAC: GM-only.
   * Mirrors mutation to the appropriate legacy array entry.
   * Note: broadcasting is handled by the caller; Player clients receive the event
   * and their reducer removes gm-only objects from local state (Mini-B).
   */
  async setObjectVisibility(
    sceneId: string,
    objectId: string,
    role: string,
    visibility: SceneObjectVisibility,
  ): Promise<SceneAnnotations> {
    if (role !== 'GM') throw new HttpError(403, 'Only GM can change object visibility');

    const annotations = await this.drawService.getAnnotations(sceneId);
    const obj = (annotations.objects ?? []).find((o) => o.id === objectId);
    if (!obj) throw new HttpError(404, 'Object not found');

    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId ? { ...candidate, visibility } : candidate
    ));

    // Mirror to legacy arrays
    annotations.images = annotations.images.map((image) => (
      image.id === objectId ? { ...image, visibility } : image
    ));
    annotations.texts = annotations.texts.map((text) => (
      text.id === objectId ? { ...text, visibility } : text
    ));
    annotations.strokes = annotations.strokes.map((stroke) => (
      stroke.strokeId === objectId ? { ...stroke, visibility } : stroke
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
  }
}

/** Sess 7.5 — write the upserted object's fields into the legacy mirror list
 *  (images[]/texts[]/strokes[]) so normalizeAnnotations preserves them. Extracted
 *  from upsertObject to keep its cyclomatic complexity ≤ 10 (lint gate). */
function mirrorUpsertedObjectToLegacy(annotations: SceneAnnotations, object: SceneObject): void {
  if (object.type === 'image') return mirrorImage(annotations, object);
  if (object.type === 'text') return mirrorText(annotations, object);
  if (object.type === 'stroke') return mirrorStroke(annotations, object);
}

function mirrorImage(annotations: SceneAnnotations, object: SceneObject & { type: 'image' }): void {
  const imgIdx = annotations.images.findIndex((i) => i.id === object.id);
  const entry: ImageAnnotation = {
    id: object.id, userId: object.userId, x: object.x, y: object.y,
    assetId: object.assetId, width: object.width, height: object.height,
    ...(object.rotation !== undefined ? { rotation: object.rotation } : {}),
    ...(object.locked !== undefined ? { locked: object.locked } : {}),
    layer: object.layer, visibility: object.visibility,
  };
  if (imgIdx >= 0) annotations.images[imgIdx] = entry;
  else annotations.images.push(entry);
}

function mirrorText(annotations: SceneAnnotations, object: SceneObject & { type: 'text' }): void {
  const txtIdx = annotations.texts.findIndex((t) => t.id === object.id);
  const entry: TextAnnotation = {
    id: object.id, userId: object.userId, x: object.x, y: object.y,
    text: object.text, fontSize: object.fontSize, color: object.color,
    ...(object.locked !== undefined ? { locked: object.locked } : {}),
    layer: object.layer, visibility: object.visibility,
  };
  if (txtIdx >= 0) annotations.texts[txtIdx] = entry;
  else annotations.texts.push(entry);
}

function mirrorStroke(annotations: SceneAnnotations, object: SceneObject & { type: 'stroke' }): void {
  const strIdx = annotations.strokes.findIndex((s) => s.strokeId === object.id);
  const entry = {
    strokeId: object.id, userId: object.userId, points: object.points,
    color: object.color, width: object.strokeWidth,
    ...(object.layer !== undefined ? { layer: object.layer } : {}),
    ...(object.visibility !== undefined ? { visibility: object.visibility } : {}),
  };
  if (strIdx >= 0) annotations.strokes[strIdx] = entry;
  else annotations.strokes.push(entry);
}

function findLegacyOwner(annotations: SceneAnnotations, annotationId: string): string | null {
  return (
    annotations.texts.find((text) => text.id === annotationId)?.userId ??
    annotations.images.find((image) => image.id === annotationId)?.userId ??
    annotations.strokes.find((stroke) => stroke.strokeId === annotationId)?.userId ??
    null
  );
}

function assertCanMutateAnnotation(
  owner: string | null,
  userId: string,
  role: string,
  action: 'move' | 'delete',
): void {
  if (!owner) throw new HttpError(404, 'Annotation not found');
  if (role !== 'GM' && owner !== userId) {
    throw new HttpError(403, `Only the author or GM can ${action} annotations`);
  }
}

function findAnnotationRemoval(
  annotations: SceneAnnotations,
  annotationId: string,
): { textIdx: number; imageIdx: number; strokeIdx: number; owner: string | null } {
  const textIdx = annotations.texts.findIndex((t) => t.id === annotationId);
  const imageIdx = annotations.images.findIndex((i) => i.id === annotationId);
  const strokeIdx = annotations.strokes.findIndex((s) => s.strokeId === annotationId);
  const object = (annotations.objects ?? []).find((candidate) => candidate.id === annotationId);
  const owner = findLegacyOwner(annotations, annotationId) ?? object?.userId ?? null;
  if (textIdx < 0 && imageIdx < 0 && strokeIdx < 0 && !object) {
    return { textIdx, imageIdx, strokeIdx, owner: null };
  }
  return { textIdx, imageIdx, strokeIdx, owner };
}

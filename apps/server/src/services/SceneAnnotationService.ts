import { randomUUID } from 'crypto';
import type {
  TextAnnotation,
  ImageAnnotation,
  SceneAnnotations,
  SceneObject,
} from '@vtt/shared';
import { normalizeAnnotations, type DrawService } from './DrawService.js';
import { HttpError } from '../lib/errors.js';
import type { PrismaClient } from '@prisma/client';

export interface TransformPayload {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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
    payload: { x: number; y: number; text: string; fontSize?: number; color?: string },
  ): Promise<SceneAnnotations> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const entry: TextAnnotation = {
      id: randomUUID(),
      userId,
      x: payload.x,
      y: payload.y,
      text: payload.text,
      fontSize: payload.fontSize ?? 16,
      color: payload.color ?? '#ffffff',
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
      },
    ];
    await this.drawService.persist(sceneId, annotations);
    return annotations;
  }

  async addImage(
    sceneId: string,
    userId: string,
    payload: { x: number; y: number; assetId: string; width?: number; height?: number },
  ): Promise<SceneAnnotations> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const entry: ImageAnnotation = {
      id: randomUUID(),
      userId,
      x: payload.x,
      y: payload.y,
      assetId: payload.assetId,
      width: payload.width ?? 128,
      height: payload.height ?? 128,
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
      },
    ];
    await this.drawService.persist(sceneId, annotations);
    return annotations;
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
   * Resize and/or rotate an image-overlay (Sess 2, Fix B).
   *
   * RBAC: GM-only.
   * Validation: width/height clamped to [gridSize, gridWidth*gridSize].
   * Rotation: normalized to [0, 360) — handles negatives from Konva.
   * Mirrors mutation to both objects[] and images[] so subsequent mutations
   * don't drop the transform (RED 1 fix).
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

    const { gridSize, gridWidth, gridHeight } = scene;
    const minSize = gridSize;
    const maxWidth = gridWidth * gridSize;
    const maxHeight = gridHeight * gridSize;

    const newWidth = Math.max(minSize, Math.min(maxWidth, Math.round(payload.width)));
    const newHeight = Math.max(minSize, Math.min(maxHeight, Math.round(payload.height)));
    const newRotation = ((payload.rotation % 360) + 360) % 360;
    // x/y are passed through as-is — no clamping (overlays may legitimately be off-screen)
    const newX = payload.x;
    const newY = payload.y;

    const annotations = await this.drawService.getAnnotations(sceneId);

    const objectExists = (annotations.objects ?? []).some((o) => o.id === objectId) ||
      annotations.images.some((img) => img.id === objectId);
    if (!objectExists) throw new HttpError(404, 'Annotation not found');

    // Update objects[] entry (includes x/y so position desync is fixed on Player side)
    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId
        ? { ...candidate, x: newX, y: newY, width: newWidth, height: newHeight, rotation: newRotation }
        : candidate
    ));

    // Update images[] mirror entry (RED 1: prevents rotation drop on next mutation)
    annotations.images = annotations.images.map((image) => (
      image.id === objectId
        ? { ...image, x: newX, y: newY, width: newWidth, height: newHeight, rotation: newRotation }
        : image
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
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
    _userId: string,
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

    // Mirror to the appropriate legacy array
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

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);

    // Return the exact newObject before normalization so the id matches
    return { annotations: normalized, newObject };
  }
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

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

    const annotations = await this.drawService.getAnnotations(sceneId);

    const objectExists = (annotations.objects ?? []).some((o) => o.id === objectId) ||
      annotations.images.some((img) => img.id === objectId);
    if (!objectExists) throw new HttpError(404, 'Annotation not found');

    // Update objects[] entry
    annotations.objects = (annotations.objects ?? []).map((candidate): SceneObject => (
      candidate.id === objectId
        ? { ...candidate, width: newWidth, height: newHeight, rotation: newRotation }
        : candidate
    ));

    // Update images[] mirror entry (RED 1: prevents rotation drop on next mutation)
    annotations.images = annotations.images.map((image) => (
      image.id === objectId
        ? { ...image, width: newWidth, height: newHeight, rotation: newRotation }
        : image
    ));

    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    return normalized;
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

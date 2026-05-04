import { randomUUID } from 'crypto';
import type {
  TextAnnotation,
  ImageAnnotation,
  SceneAnnotations,
  SceneObject,
  SceneUpdatedPayload,
  TokenPublicDTO,
} from '@vtt/shared';
import { normalizeAnnotations, type DrawService } from './DrawService.js';
import { HttpError } from '../lib/errors.js';
import { projectToken } from './projections.js';
import type { PrismaClient } from '@prisma/client';

/** Broadcasts scene:updated to the room after annotation mutation. */
export type AnnotationSceneBroadcaster = (roomId: string, payload: SceneUpdatedPayload) => void;

/**
 * Manages pinned text (Ф3.4.4) and image (Ф3.4.5) canvas annotations.
 *
 * Both are GM-only. Stored alongside draw strokes in Scene.annotations JSONB
 * via DrawService (shared cache). After each mutation the service broadcasts
 * `scene:updated` with annotations payload so all clients update.
 */
export class SceneAnnotationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly drawService: DrawService,
    private readonly broadcast: AnnotationSceneBroadcaster,
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
    await this.broadcastSceneUpdated(sceneId, annotations);
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
    await this.broadcastSceneUpdated(sceneId, annotations);
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
    await this.broadcastSceneUpdated(sceneId, normalized);
    return normalized;
  }

  async removeAnnotation(sceneId: string, annotationId: string, userId: string, role: string): Promise<void> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const removal = findAnnotationRemoval(annotations, annotationId);
    assertCanMutateAnnotation(removal.owner, userId, role, 'delete');
    if (removal.textIdx >= 0) annotations.texts.splice(removal.textIdx, 1);
    if (removal.imageIdx >= 0) annotations.images.splice(removal.imageIdx, 1);
    if (removal.strokeIdx >= 0) annotations.strokes.splice(removal.strokeIdx, 1);
    annotations.objects = (annotations.objects ?? []).filter((candidate) => candidate.id !== annotationId);
    const normalized = normalizeAnnotations(annotations);
    await this.drawService.persist(sceneId, normalized);
    await this.broadcastSceneUpdated(sceneId, normalized);
  }

  private async broadcastSceneUpdated(sceneId: string, annotations: SceneAnnotations): Promise<void> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      include: { tokens: true },
    });
    if (!scene) return;
    const tokens: TokenPublicDTO[] = scene.tokens
      .map((t) => projectToken(t, 'GM', ''))
      .filter((t): t is TokenPublicDTO => t !== null);
    const payload: SceneUpdatedPayload = { sceneId, version: 0, tokens, annotations };
    this.broadcast(scene.roomId, payload);
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

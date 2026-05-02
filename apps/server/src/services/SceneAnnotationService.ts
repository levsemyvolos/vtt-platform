import { randomUUID } from 'crypto';
import type {
  TextAnnotation,
  ImageAnnotation,
  SceneAnnotations,
  SceneUpdatedPayload,
  TokenPublicDTO,
} from '@vtt/shared';
import type { DrawService } from './DrawService.js';
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
    await this.drawService.persist(sceneId, annotations);
    await this.broadcastSceneUpdated(sceneId, annotations);
    return annotations;
  }

  async removeAnnotation(sceneId: string, annotationId: string, userId: string, role: string): Promise<void> {
    const annotations = await this.drawService.getAnnotations(sceneId);
    const textIdx = annotations.texts.findIndex((t) => t.id === annotationId);
    const imageIdx = annotations.images.findIndex((i) => i.id === annotationId);
    if (textIdx < 0 && imageIdx < 0) throw new HttpError(404, 'Annotation not found');
    if (role !== 'GM') {
      const owner = textIdx >= 0 ? annotations.texts[textIdx]!.userId : annotations.images[imageIdx]!.userId;
      if (owner !== userId) throw new HttpError(403, 'Only the author or GM can delete annotations');
    }
    if (textIdx >= 0) annotations.texts.splice(textIdx, 1);
    else annotations.images.splice(imageIdx, 1);
    await this.drawService.persist(sceneId, annotations);
    await this.broadcastSceneUpdated(sceneId, annotations);
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

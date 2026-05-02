import type { PrismaClient } from '@prisma/client';
import type { DrawStrokePayload, DrawStroke, SceneAnnotations } from '@vtt/shared';

export interface DrawBroadcast {
  stroke: (roomId: string, payload: DrawStrokePayload) => void;
  clear: (roomId: string, sceneId: string) => void;
}

/** Parses raw JSONB value from Prisma into SceneAnnotations (handles both structured and legacy flat-array formats). */
export function parseAnnotations(raw: unknown): SceneAnnotations {
  if (!raw) return { strokes: [], texts: [], images: [] };
  if (Array.isArray(raw)) {
    // Legacy format from Б4 — flat DrawStroke[] array; migrate on read.
    return { strokes: raw as DrawStroke[], texts: [], images: [] };
  }
  const obj = raw as Partial<SceneAnnotations>;
  return {
    strokes: Array.isArray(obj.strokes) ? (obj.strokes as DrawStroke[]) : [],
    texts: Array.isArray(obj.texts) ? obj.texts : [],
    images: Array.isArray(obj.images) ? obj.images : [],
  };
}

/**
 * Manages persisted free-draw strokes (Ф3.4.2).
 *
 * Strokes are stored inside `Scene.annotations.strokes` JSONB.
 * In-memory cache avoids a read-before-write on every stroke.
 *
 * Only GM may call `addStroke`/`clearStrokes` — the socket handler enforces RBAC.
 */
export class DrawService {
  private readonly cache = new Map<string, SceneAnnotations>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly broadcast: DrawBroadcast,
  ) {}

  async addStroke(payload: DrawStrokePayload): Promise<void> {
    const annotations = await this.getAnnotations(payload.sceneId);
    const existing = annotations.strokes.findIndex((s) => s.strokeId === payload.strokeId);
    const stroke: DrawStroke = {
      strokeId: payload.strokeId,
      userId: payload.userId,
      points: payload.points,
      color: payload.color,
      width: payload.width,
    };
    if (existing >= 0) {
      annotations.strokes[existing] = stroke;
    } else {
      annotations.strokes.push(stroke);
    }
    await this.persist(payload.sceneId, annotations);
    this.broadcast.stroke(payload.roomId, payload);
  }

  async clearStrokes(roomId: string, sceneId: string): Promise<void> {
    const annotations = await this.getAnnotations(sceneId);
    annotations.strokes = [];
    await this.persist(sceneId, annotations);
    this.broadcast.clear(roomId, sceneId);
  }

  async getAnnotations(sceneId: string): Promise<SceneAnnotations> {
    if (this.cache.has(sceneId)) return this.cache.get(sceneId)!;
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: { annotations: true },
    });
    const parsed = parseAnnotations(scene?.annotations);
    this.cache.set(sceneId, parsed);
    return parsed;
  }

  async persist(sceneId: string, annotations: SceneAnnotations): Promise<void> {
    this.cache.set(sceneId, annotations);
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json accepts any
      data: { annotations: annotations as any },
    });
  }
}

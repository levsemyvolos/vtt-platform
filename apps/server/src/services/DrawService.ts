import type { PrismaClient } from '@prisma/client';
import type { DrawStrokePayload, DrawStroke } from '@vtt/shared';

export interface DrawBroadcast {
  stroke: (roomId: string, payload: DrawStrokePayload) => void;
  clear: (roomId: string, sceneId: string) => void;
}

/**
 * Manages persisted free-draw strokes (Ф3.4.2).
 *
 * Strokes are stored in `Scene.annotations` JSONB as `DrawStroke[]`.
 * In-memory cache avoids a read-before-write on every stroke; the cache is
 * populated lazily on first stroke for a given scene.
 *
 * Only GM may call `addStroke`/`clearStrokes` — the socket handler enforces RBAC.
 */
export class DrawService {
  private readonly cache = new Map<string, DrawStroke[]>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly broadcast: DrawBroadcast,
  ) {}

  async addStroke(payload: DrawStrokePayload): Promise<void> {
    const strokes = await this.getStrokes(payload.sceneId);
    const existing = strokes.findIndex((s) => s.strokeId === payload.strokeId);
    const stroke: DrawStroke = {
      strokeId: payload.strokeId,
      userId: payload.userId,
      points: payload.points,
      color: payload.color,
      width: payload.width,
    };
    if (existing >= 0) {
      strokes[existing] = stroke;
    } else {
      strokes.push(stroke);
    }
    await this.persist(payload.sceneId, strokes);
    this.broadcast.stroke(payload.roomId, payload);
  }

  async clearStrokes(roomId: string, sceneId: string): Promise<void> {
    this.cache.set(sceneId, []);
    await this.persist(sceneId, []);
    this.broadcast.clear(roomId, sceneId);
  }

  private async getStrokes(sceneId: string): Promise<DrawStroke[]> {
    if (this.cache.has(sceneId)) return this.cache.get(sceneId)!;
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: { annotations: true },
    });
    const strokes = Array.isArray(scene?.annotations)
      ? (scene!.annotations as unknown as DrawStroke[])
      : [];
    this.cache.set(sceneId, strokes);
    return strokes;
  }

  private async persist(sceneId: string, strokes: DrawStroke[]): Promise<void> {
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json accepts any[]
      data: { annotations: strokes as any },
    });
  }
}

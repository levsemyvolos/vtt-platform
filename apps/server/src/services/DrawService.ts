import type { PrismaClient } from '@prisma/client';
import type { DrawStrokePayload, DrawStroke, SceneAnnotations, FogMaskDiffPayload } from '@vtt/shared';

export interface DrawBroadcast {
  stroke: (roomId: string, payload: DrawStrokePayload) => void;
  clear: (roomId: string, sceneId: string) => void;
  fogDiff: (roomId: string, payload: FogMaskDiffPayload) => void;
  fogClear: (roomId: string, sceneId: string) => void;
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

  async applyFogDiff(
    roomId: string,
    payload: FogMaskDiffPayload,
  ): Promise<void> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: payload.sceneId },
      select: { fogMaskBase64: true },
    });
    const next = xorPackedMasks(scene?.fogMaskBase64 ?? null, payload.diffBase64);
    await this.prisma.scene.update({
      where: { id: payload.sceneId },
      data: { fogMaskBase64: next },
    });
    this.broadcast.fogDiff(roomId, payload);
  }

  async clearFog(roomId: string, sceneId: string): Promise<void> {
    await this.prisma.scene.update({
      where: { id: sceneId },
      data: { fogMaskBase64: null },
    });
    this.broadcast.fogClear(roomId, sceneId);
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

function xorPackedMasks(baseBase64: string | null, diffBase64: string): string {
  const base = baseBase64 ? Buffer.from(baseBase64, 'base64') : Buffer.alloc(0);
  const diff = Buffer.from(diffBase64, 'base64');
  const len = Math.max(base.length, diff.length);
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    out[i] = (base[i] ?? 0) ^ (diff[i] ?? 0);
  }
  return out.toString('base64');
}

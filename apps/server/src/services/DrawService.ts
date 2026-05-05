import type { PrismaClient } from '@prisma/client';
import type {
  DrawStrokePayload,
  DrawStroke,
  SceneAnnotations,
  FogShape,
  FogShapeAddPayload,
  FogShapeRemovePayload,
  SceneObject,
} from '@vtt/shared';

export interface DrawBroadcast {
  stroke: (roomId: string, payload: DrawStrokePayload) => void;
  clear: (roomId: string, sceneId: string) => void;
  fogShapeAdd: (roomId: string, payload: FogShapeAddPayload) => void;
  fogShapeRemove: (roomId: string, payload: FogShapeRemovePayload) => void;
  fogClear: (roomId: string, sceneId: string) => void;
}

function isFogShape(item: unknown): item is FogShape {
  if (!item || typeof item !== 'object') return false;
  const s = item as Partial<FogShape>;
  return (
    typeof s.id === 'string' &&
    typeof s.x === 'number' &&
    typeof s.y === 'number' &&
    typeof s.w === 'number' &&
    typeof s.h === 'number' &&
    (s.mode === 'hide' || s.mode === 'reveal') &&
    typeof s.createdAt === 'number'
  );
}

/** Reads `Scene.fogShapes` JSON column into a normalized FogShape[]. */
export function parseFogShapes(raw: unknown): FogShape[] {
  if (!Array.isArray(raw)) return [];
  const out: FogShape[] = [];
  for (const item of raw) {
    if (isFogShape(item)) {
      out.push({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h, mode: item.mode, createdAt: item.createdAt });
    }
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

/** Parses raw JSONB value from Prisma into SceneAnnotations (handles both structured and legacy flat-array formats). */
export function parseAnnotations(raw: unknown): SceneAnnotations {
  if (!raw) return { schemaVersion: 2, strokes: [], texts: [], images: [], objects: [] };
  if (Array.isArray(raw)) {
    const strokes = raw as DrawStroke[];
    return {
      schemaVersion: 2,
      strokes,
      texts: [],
      images: [],
      objects: strokes.map(strokeToObject),
    };
  }
  const obj = raw as Partial<SceneAnnotations>;
  const strokes = Array.isArray(obj.strokes) ? (obj.strokes as DrawStroke[]) : [];
  const texts = Array.isArray(obj.texts) ? obj.texts : [];
  const images = Array.isArray(obj.images) ? obj.images : [];
  const objects = Array.isArray(obj.objects)
    ? obj.objects
    : [...strokes.map(strokeToObject), ...texts.map(textToObject), ...images.map(imageToObject)];
  return {
    schemaVersion: 2,
    strokes,
    texts,
    images,
    objects,
  };
}

export function normalizeAnnotations(annotations: SceneAnnotations): SceneAnnotations {
  const objectsById = new Map((annotations.objects ?? []).map((object) => [object.id, object]));
  indexStrokes(annotations, objectsById);
  indexTexts(annotations, objectsById);
  indexImages(annotations, objectsById);
  return {
    schemaVersion: 2,
    strokes: annotations.strokes,
    texts: annotations.texts,
    images: annotations.images,
    objects: [...objectsById.values()].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
  };
}

function indexStrokes(annotations: SceneAnnotations, objectsById: Map<string, SceneObject>): void {
  for (const [index, stroke] of annotations.strokes.entries()) {
    const current = objectsById.get(stroke.strokeId);
    objectsById.set(stroke.strokeId, {
      ...strokeToObject(stroke, index),
      x: current?.x ?? stroke.x ?? 0,
      y: current?.y ?? stroke.y ?? 0,
    });
  }
}

function indexTexts(annotations: SceneAnnotations, objectsById: Map<string, SceneObject>): void {
  for (const [index, text] of annotations.texts.entries()) {
    const current = objectsById.get(text.id);
    objectsById.set(text.id, { ...textToObject(text, index), zIndex: current?.zIndex ?? index });
  }
}

function indexImages(annotations: SceneAnnotations, objectsById: Map<string, SceneObject>): void {
  for (const [index, image] of annotations.images.entries()) {
    const current = objectsById.get(image.id);
    objectsById.set(image.id, { ...imageToObject(image, index), zIndex: current?.zIndex ?? index });
  }
}

function strokeToObject(stroke: DrawStroke, index = 0): SceneObject {
  return {
    id: stroke.strokeId,
    type: 'stroke',
    userId: stroke.userId,
    x: stroke.x ?? 0,
    y: stroke.y ?? 0,
    zIndex: index,
    points: stroke.points,
    color: stroke.color,
    strokeWidth: stroke.width,
  };
}

function textToObject(text: NonNullable<SceneAnnotations['texts']>[number], index = 0): SceneObject {
  return {
    id: text.id,
    type: 'text',
    userId: text.userId,
    x: text.x,
    y: text.y,
    zIndex: index,
    text: text.text,
    fontSize: text.fontSize,
    color: text.color,
  };
}

function imageToObject(image: NonNullable<SceneAnnotations['images']>[number], index = 0): SceneObject {
  return {
    id: image.id,
    type: 'image',
    userId: image.userId,
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
    // Sess 2: preserve rotation so subsequent mutations don't drop it (RED 1 fix).
    rotation: image.rotation ?? 0,
    // Sess 3: preserve locked flag so lock state survives normalization round-trips.
    ...(image.locked !== undefined ? { locked: image.locked } : {}),
    zIndex: index,
    assetId: image.assetId,
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
    await this.persist(payload.sceneId, normalizeAnnotations(annotations));
    this.broadcast.stroke(payload.roomId, payload);
  }

  async clearStrokes(roomId: string, sceneId: string): Promise<void> {
    const annotations = await this.getAnnotations(sceneId);
    annotations.strokes = [];
    annotations.objects = (annotations.objects ?? []).filter((object) => object.type !== 'stroke');
    await this.persist(sceneId, normalizeAnnotations(annotations));
    this.broadcast.clear(roomId, sceneId);
  }

  async addFogShape(payload: FogShapeAddPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const scene = await tx.scene.findUnique({
        where: { id: payload.sceneId },
        select: { fogShapes: true },
      });
      const shapes = parseFogShapes(scene?.fogShapes);
      if (shapes.some((s) => s.id === payload.shape.id)) return;
      shapes.push(payload.shape);
      await tx.scene.update({
        where: { id: payload.sceneId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
        data: { fogShapes: shapes as any },
      });
    });
    this.broadcast.fogShapeAdd(payload.roomId, payload);
  }

  async removeFogShape(payload: FogShapeRemovePayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const scene = await tx.scene.findUnique({
        where: { id: payload.sceneId },
        select: { fogShapes: true },
      });
      const shapes = parseFogShapes(scene?.fogShapes).filter((s) => s.id !== payload.shapeId);
      await tx.scene.update({
        where: { id: payload.sceneId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
        data: { fogShapes: shapes as any },
      });
    });
    this.broadcast.fogShapeRemove(payload.roomId, payload);
  }

  async clearFog(roomId: string, sceneId: string): Promise<void> {
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
      data: { fogShapes: [] as any },
    });
    this.broadcast.fogClear(roomId, sceneId);
  }

  /** Atomically replaces fog shapes without broadcasting (caller handles broadcast). */
  async setFogShapes(sceneId: string, shapes: FogShape[]): Promise<void> {
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
      data: { fogShapes: shapes as any },
    });
  }

  async getAnnotations(sceneId: string): Promise<SceneAnnotations> {
    if (this.cache.has(sceneId)) return this.cache.get(sceneId)!;
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: { annotations: true },
    });
    const parsed = normalizeAnnotations(parseAnnotations(scene?.annotations));
    this.cache.set(sceneId, parsed);
    return parsed;
  }

  async persist(sceneId: string, annotations: SceneAnnotations): Promise<void> {
    const normalized = normalizeAnnotations(annotations);
    this.cache.set(sceneId, normalized);
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json accepts any
      data: { annotations: normalized as any },
    });
  }
}


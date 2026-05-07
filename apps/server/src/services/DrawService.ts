import type { PrismaClient } from '@prisma/client';
import type {
  DrawStrokePayload,
  DrawStroke,
  SceneAnnotations,
  FogShape,
  FogShapeAddPayload,
  FogShapeRemovePayload,
  FogBitmap,
  FogBitmapPushPayload,
  FogBitmapUpdatePayload,
  FogState,
  SceneObject,
  SceneObjectLayer,
  SceneObjectVisibility,
} from '@vtt/shared';

export interface DrawBroadcast {
  stroke: (roomId: string, payload: DrawStrokePayload) => void;
  clear: (roomId: string, sceneId: string) => void;
  fogShapeAdd: (roomId: string, payload: FogShapeAddPayload) => void;
  fogShapeRemove: (roomId: string, payload: FogShapeRemovePayload) => void;
  fogClear: (roomId: string, sceneId: string) => void;
  /** Sess 11 — emit `fog:bitmap-update` to the room after a bitmap push. */
  fogBitmapUpdate: (roomId: string, payload: FogBitmapUpdatePayload) => void;
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
  if (!Array.isArray(raw)) {
    // Sess 11 — when the column holds the new FogState shape, the bare array
    // form is replaced by `{ shapes, bitmap }`. Extract shapes; the caller can
    // use parseFogState if it also needs the bitmap.
    if (raw && typeof raw === 'object' && Array.isArray((raw as Partial<FogState>).shapes)) {
      return parseFogShapes((raw as FogState).shapes);
    }
    return [];
  }
  const out: FogShape[] = [];
  for (const item of raw) {
    if (isFogShape(item)) {
      out.push({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h, mode: item.mode, createdAt: item.createdAt });
    }
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

/** Sess 11 — guard for the bitmap blob: a string `data` URL plus positive
 *  width/height. We do NOT attempt to validate PNG bytes here; that's a
 *  client-side concern and the server only treats the blob as opaque storage. */
function isFogBitmap(item: unknown): item is FogBitmap {
  if (!item || typeof item !== 'object') return false;
  const b = item as Partial<FogBitmap>;
  return (
    typeof b.data === 'string' &&
    b.data.startsWith('data:image/') &&
    typeof b.w === 'number' && b.w > 0 &&
    typeof b.h === 'number' && b.h > 0
  );
}

/** Reads `Scene.fogShapes` into the canonical Sess 11 FogState. Lazily wraps
 *  legacy `FogShape[]` payloads so older scenes keep working without a
 *  Prisma migration. */
export function parseFogState(raw: unknown): FogState {
  if (Array.isArray(raw)) {
    return { shapes: parseFogShapes(raw), bitmap: null };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Partial<FogState>;
    const bitmap = isFogBitmap(obj.bitmap) ? obj.bitmap : null;
    return { shapes: parseFogShapes(obj.shapes), bitmap };
  }
  return { shapes: [], bitmap: null };
}

/** Reads `Scene.fogShapes` and returns just the bitmap (or null). Mirrors
 *  `parseFogShapes` for the `fogBitmap` column of SceneDTO. */
export function parseFogBitmap(raw: unknown): FogBitmap | null {
  return parseFogState(raw).bitmap;
}

/** Sess 11 — canonical write-form for the `Scene.fogShapes` JSONB column.
 *  Always emits the FogState envelope (`{ shapes, bitmap }`) so all rows
 *  written after this version use the new shape; legacy rows are auto-wrapped
 *  on the next read via parseFogState. */
export function serializeFogState(state: FogState): { shapes: FogShape[]; bitmap: FogBitmap | null } {
  return { shapes: state.shapes, bitmap: state.bitmap };
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

// Sess 7 fix: objects[] is authoritative for SceneObject state — preserve all
// fields (incl. scaleX/scaleY/rotation/locked) when an entry already exists.
// Legacy lists (strokes/texts/images) only seed objects[] for entries that
// haven't been mirrored yet (e.g. very old data, or freshly added before
// the writer pushed to objects[]).

function indexStrokes(annotations: SceneAnnotations, objectsById: Map<string, SceneObject>): void {
  for (const [index, stroke] of annotations.strokes.entries()) {
    const current = objectsById.get(stroke.strokeId);
    if (current && current.type === 'stroke') {
      // Refresh geometry/style from legacy (in case the legacy stroke was
      // updated independently), but keep transform/lock/layer/visibility as-is.
      objectsById.set(stroke.strokeId, {
        ...current,
        points: stroke.points,
        color: stroke.color,
        strokeWidth: stroke.width,
      });
    } else {
      objectsById.set(stroke.strokeId, strokeToObject(stroke, index));
    }
  }
}

function indexTexts(annotations: SceneAnnotations, objectsById: Map<string, SceneObject>): void {
  for (const [index, text] of annotations.texts.entries()) {
    const current = objectsById.get(text.id);
    if (current && current.type === 'text') {
      // Sess 7: keep rotation/locked/scale; refresh content/font/color from legacy mirror.
      objectsById.set(text.id, {
        ...current,
        text: text.text,
        fontSize: text.fontSize,
        color: text.color,
      });
    } else {
      objectsById.set(text.id, { ...textToObject(text, index), zIndex: index });
    }
  }
}

function indexImages(annotations: SceneAnnotations, objectsById: Map<string, SceneObject>): void {
  for (const [index, image] of annotations.images.entries()) {
    const current = objectsById.get(image.id);
    if (current && current.type === 'image') {
      // Refresh geometry from legacy mirror; keep zIndex/layer/visibility/locked from current.
      objectsById.set(image.id, {
        ...current,
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
        rotation: image.rotation ?? current.rotation ?? 0,
        assetId: image.assetId,
      });
    } else {
      objectsById.set(image.id, { ...imageToObject(image, index), zIndex: index });
    }
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
    layer: (stroke.layer ?? 'overlay') as SceneObjectLayer,
    visibility: (stroke.visibility ?? 'all') as SceneObjectVisibility,
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
    layer: (text.layer ?? 'overlay') as SceneObjectLayer,
    visibility: (text.visibility ?? 'all') as SceneObjectVisibility,
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
    // Sess 5 Mini-A: layer/visibility defaults — 'tile' for images, 'all' visibility.
    layer: (image.layer ?? 'tile') as SceneObjectLayer,
    visibility: (image.visibility ?? 'all') as SceneObjectVisibility,
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
      const state = parseFogState(scene?.fogShapes);
      if (state.shapes.some((s) => s.id === payload.shape.id)) return;
      state.shapes.push(payload.shape);
      await tx.scene.update({
        where: { id: payload.sceneId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
        data: { fogShapes: serializeFogState(state) as any },
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
      const state = parseFogState(scene?.fogShapes);
      state.shapes = state.shapes.filter((s) => s.id !== payload.shapeId);
      await tx.scene.update({
        where: { id: payload.sceneId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
        data: { fogShapes: serializeFogState(state) as any },
      });
    });
    this.broadcast.fogShapeRemove(payload.roomId, payload);
  }

  async clearFog(roomId: string, sceneId: string): Promise<void> {
    // Sess 11 — clearing fog also drops the bitmap (semantic match: "remove
    // ALL fog"). Persisted as the canonical empty FogState.
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
      data: { fogShapes: serializeFogState({ shapes: [], bitmap: null }) as any },
    });
    this.broadcast.fogClear(roomId, sceneId);
  }

  /** Atomically replaces fog shapes without broadcasting (caller handles broadcast).
   *  Sess 11 — preserves the existing bitmap (use clearFog to drop both). */
  async setFogShapes(sceneId: string, shapes: FogShape[]): Promise<void> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: { fogShapes: true },
    });
    const state = parseFogState(scene?.fogShapes);
    state.shapes = shapes;
    await this.prisma.scene.update({
      where: { id: sceneId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
      data: { fogShapes: serializeFogState(state) as any },
    });
  }

  /**
   * Sess 11 — applies a GM-rendered bitmap, replacing the consumed shape ids
   * with the bitmap as the new base layer. Shapes added during the GM render
   * window (whose ids are NOT in `consumedShapeIds`) survive and remain on
   * top of the bitmap. Returns the resulting FogBitmapUpdatePayload so the
   * caller can broadcast it.
   */
  async applyBitmapPush(payload: FogBitmapPushPayload): Promise<FogBitmapUpdatePayload> {
    const consumed = new Set(payload.consumedShapeIds);
    let bitmap: FogBitmap | null = payload.bitmap;
    await this.prisma.$transaction(async (tx) => {
      const scene = await tx.scene.findUnique({
        where: { id: payload.sceneId },
        select: { fogShapes: true },
      });
      const state = parseFogState(scene?.fogShapes);
      state.shapes = state.shapes.filter((s) => !consumed.has(s.id));
      state.bitmap = bitmap;
      await tx.scene.update({
        where: { id: payload.sceneId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json
        data: { fogShapes: serializeFogState(state) as any },
      });
    });
    const broadcast: FogBitmapUpdatePayload = {
      roomId: payload.roomId,
      sceneId: payload.sceneId,
      bitmap,
      consumedShapeIds: payload.consumedShapeIds,
    };
    this.broadcast.fogBitmapUpdate(payload.roomId, broadcast);
    return broadcast;
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


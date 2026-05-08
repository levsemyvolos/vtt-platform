export type Role = 'GM' | 'Player' | 'Observer';

export type SceneObjectLayer = 'tile' | 'overlay';
export type SceneObjectVisibility = 'all' | 'gm-only';

export type BackgroundFit = 'cover' | 'contain' | 'stretch';

export type ChatMode = 'normal' | 'ic' | 'ooc' | 'whisper' | 'secret_roll';

export type DiceMode = 'normal' | 'advantage' | 'disadvantage';

export type StatusMarker =
  | 'blinded' | 'charmed' | 'deafened' | 'frightened' | 'grappled'
  | 'incapacitated' | 'invisible' | 'paralyzed' | 'petrified' | 'poisoned'
  | 'prone' | 'restrained' | 'stunned' | 'unconscious';

export const ALL_STATUS_MARKERS: readonly StatusMarker[] = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious',
];

/**
 * Public projection of Token (algorithm A6 RBAC-projection, §2.17).
 * Observer never receives `hp` / `statusMarkers`; hidden tokens are filtered out
 * upstream (they never appear in this DTO at all).
 */
export interface TokenPublicDTO {
  id: string;
  name: string;
  x: number;
  y: number;
  sceneId: string;
  imageUrl: string;
  /** Monotonic OCC version per algorithm A2 (§2.17). */
  version: number;
  color?: string;
  /** GM and token owner only */
  hp?: number;
  /** GM and token owner only */
  maxHp?: number;
  /** GM and token owner only */
  statusMarkers?: StatusMarker[];
  /** Visible to all — needed for R1 player-drag-own-token check */
  assignedUserId?: string | null;
}

export type AssetSourceLabel = 'upload' | 'ai_image' | 'ai_audio';

export interface AssetDTO {
  id: string;
  url: string;
  type: string;
  name: string;
  roomId: string;
  source: AssetSourceLabel;
  aiPrompt: string | null;
  aiModel: string | null;
  createdAt: string;
}

// Note: HandoutDTO / CharacterSheetDTO / NoteDTO are defined in
// `../rest/handouts.ts`, `../rest/characters.ts`, `../rest/notes.ts`
// (introduced for Чат 7.1 — кампанійні матеріали Ф7+Ф9).

export interface ChatMessageDTO {
  id: string;
  roomId: string;
  userId: string;
  mode: ChatMode;
  text?: string;
  rollPayload?: {
    expression: string;
    total: number;
    rolls: number[];
    mode: DiceMode;
  };
  recipientId?: string;
  createdAt: string;
}

/**
 * Initiative tracker entry projected for clients (Ф7.3).
 * `orderIndex` defines turn order within equal-initiative ties; `isCurrent`
 * highlights whose turn it is now.
 */
export interface InitiativeEntryDTO {
  id: string;
  name: string;
  initiative: number;
  orderIndex: number;
  isCurrent: boolean;
  characterId?: string;
  tokenId?: string;
}

/** Persisted free-draw stroke (Ф3.4.2). Stored in Scene.annotations JSONB. */
export interface DrawStroke {
  strokeId: string;
  userId: string;
  points: number[];
  color: string;
  width: number;
  x?: number;
  y?: number;
  layer?: SceneObjectLayer;
  visibility?: SceneObjectVisibility;
}

/** Pinned text label on the scene canvas (Ф3.4.4). GM-only. */
export interface TextAnnotation {
  id: string;
  userId: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  layer?: SceneObjectLayer;
  visibility?: SceneObjectVisibility;
}

/** Pinned image overlay on the scene canvas (Ф3.4.5). GM-only. */
export interface ImageAnnotation {
  id: string;
  userId: string;
  x: number;
  y: number;
  assetId: string;
  width: number;
  height: number;
  /** Rotation in degrees [0, 360). Added in Sess 2 for Transformer support. */
  rotation?: number;
  /** When true, the overlay is rendered but ignores drag/transform until unlocked (Sess 3). */
  locked?: boolean;
  layer?: SceneObjectLayer;
  visibility?: SceneObjectVisibility;
}

export type SceneObjectType = 'text' | 'image' | 'stroke';

export interface SceneObjectBase {
  id: string;
  type: SceneObjectType;
  userId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  zIndex: number;
  locked?: boolean;
  /** Render layer relative to tokens (Sess 5 Mini-A). */
  layer: SceneObjectLayer;
  /** RBAC visibility — 'gm-only' objects are filtered from Player/Observer projections (Sess 5 Mini-A). */
  visibility: SceneObjectVisibility;
}

export interface TextSceneObject extends SceneObjectBase {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
}

export interface ImageSceneObject extends SceneObjectBase {
  type: 'image';
  assetId: string;
  width: number;
  height: number;
}

export interface StrokeSceneObject extends SceneObjectBase {
  type: 'stroke';
  points: number[];
  color: string;
  strokeWidth: number;
}

export type SceneObject = TextSceneObject | ImageSceneObject | StrokeSceneObject;

/** Structured container stored in Scene.annotations JSONB. */
export interface SceneAnnotations {
  schemaVersion?: number;
  strokes: DrawStroke[];
  texts: TextAnnotation[];
  images: ImageAnnotation[];
  objects?: SceneObject[];
}

const EMPTY_SCENE_ANNOTATIONS: SceneAnnotations = {
  schemaVersion: 2,
  strokes: [],
  texts: [],
  images: [],
  objects: [],
};
export { EMPTY_SCENE_ANNOTATIONS };

/**
 * Pixel-precise rectangular fog region (Ф3.3, shape-list model).
 * Composed in `createdAt` ASC order: `hide` paints opaque, `reveal` cuts holes.
 */
export interface FogShape {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'hide' | 'reveal';
  createdAt: number;
}

/**
 * Sess 11 — compacted fog mask. When the per-scene shape count exceeds
 * FOG_COMPACTION_THRESHOLD (50), the GM client renders all shapes into a
 * single PNG bitmap and pushes it to the server. The bitmap then becomes the
 * base layer; subsequent fog shapes are drawn on top of it. Stored inline
 * (data-URL string) inside the existing fogShapes JSONB column to avoid a
 * Prisma migration.
 *
 * Dimensions are scene-coord pixels (gridSize * gridWidth/gridHeight) capped
 * at FOG_BITMAP_MAX_DIM = 4096 px on the longer side. The bitmap is a 1-bit
 * alpha mask: opaque = hidden, transparent = visible.
 */
export interface FogBitmap {
  /** PNG data URL ("data:image/png;base64,…"). */
  data: string;
  /** Bitmap width in scene-coord pixels. */
  w: number;
  /** Bitmap height in scene-coord pixels. */
  h: number;
}

/**
 * Sess 11 — composite fog state persisted on Scene.fogShapes. New canonical
 * shape; the server's parser auto-wraps any legacy `FogShape[]` payload as
 * `{ shapes: […], bitmap: null }` on read so older scenes keep working
 * without a migration.
 */
export interface FogState {
  shapes: FogShape[];
  bitmap: FogBitmap | null;
}

/** Sess 11 — once `state.shapes.length` reaches this, the GM client triggers
 *  a compact: renders the shapes into FogBitmap, emits `fog:bitmap-push`. */
export const FOG_COMPACTION_THRESHOLD = 50;

/** Sess 11 — hard cap on the longer side of the rendered bitmap. Larger
 *  scenes are downscaled to keep the JSONB blob bounded (~few hundred kB). */
export const FOG_BITMAP_MAX_DIM = 4096;

/**
 * Scene snapshot used by GET /rooms/:id/scenes/:sceneId and SessionResyncPayload.
 * Tokens are projected per A6 (RBAC) before being placed in this DTO.
 */
export interface SceneDTO {
  id: string;
  roomId: string;
  name: string;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  gridVisible: boolean;
  isActive: boolean;
  isHidden: boolean;
  fogShapes: FogShape[];
  /** Sess 11 — compacted fog mask (bitmap form). Absent or null until the
   *  per-scene shape count crosses FOG_COMPACTION_THRESHOLD; rendered
   *  underneath any remaining post-compact shapes. Optional so existing
   *  tests / fixtures without this field keep type-checking. */
  fogBitmap?: FogBitmap | null;
  tokens: TokenPublicDTO[];
  /** Optional URL for the scene background bitmap (Ф2.2.5). */
  backgroundUrl?: string | null;
  /** Background image fit mode (Mini-A). */
  backgroundFit: BackgroundFit;
  /** Horizontal offset of the background image in pixels (Mini-A). */
  backgroundOffsetX: number;
  /** Vertical offset of the background image in pixels (Mini-A). */
  backgroundOffsetY: number;
  /** Scale multiplier applied to the background image natural size (Mini-A). */
  backgroundScale: number;
  /** Structured canvas annotations — strokes + text labels + image overlays (Ф3.4.2–5). */
  annotations: SceneAnnotations;
}

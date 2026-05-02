export type Role = 'GM' | 'Player' | 'Observer';

export type ChatMode = 'normal' | 'ic' | 'ooc' | 'whisper' | 'secret_roll';

export type DiceMode = 'normal' | 'advantage' | 'disadvantage' | 'secret';

export type StatusMarker =
  | 'poisoned' | 'stunned' | 'prone' | 'blinded' | 'charmed' | 'frightened'
  | 'grappled' | 'incapacitated' | 'paralyzed' | 'petrified' | 'restrained' | 'unconscious';

export const ALL_STATUS_MARKERS: readonly StatusMarker[] = [
  'poisoned', 'stunned', 'prone', 'blinded', 'charmed', 'frightened',
  'grappled', 'incapacitated', 'paralyzed', 'petrified', 'restrained', 'unconscious',
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

export interface AssetDTO {
  id: string;
  url: string;
  type: string;
  name: string;
  roomId: string;
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
}

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
  isActive: boolean;
  isHidden: boolean;
  fogMaskBase64: string | null;
  tokens: TokenPublicDTO[];
  /** Free-draw strokes persisted in DB (Ф3.4.2). */
  annotations: DrawStroke[];
}

export type Role = 'GM' | 'Player' | 'Observer';

export type ChatMode = 'normal' | 'ic' | 'ooc' | 'whisper' | 'secret_roll';

export type DiceMode = 'normal' | 'advantage' | 'disadvantage' | 'secret';

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
  /** Present only for GM and the assigned player; omitted for Observer. */
  hp?: number;
  /** Present only for GM and the assigned player; omitted for Observer. */
  statusMarkers?: string[];
}

export interface AssetDTO {
  id: string;
  url: string;
  type: string;
  name: string;
  roomId: string;
}

export interface CharacterSheetDTO {
  id: string;
  name: string;
  portraitUrl?: string;
  sheetData?: Record<string, unknown>;
}

export interface HandoutDTO {
  id: string;
  title: string;
  content?: string;
  assetUrl?: string;
  recipients: string[];
  roomId: string;
}

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

export interface InitiativeEntryDTO {
  id: string;
  name: string;
  initiative: number;
  characterId?: string;
  tokenId?: string;
}

export interface NoteDTO {
  id: string;
  title: string;
  content: string;
  roomId: string;
  ownerId: string;
}

export interface AudioTrackDTO {
  id: string;
  name: string;
  url: string;
  loop: boolean;
  fade: boolean;
  sceneId: string;
  roomId: string;
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
}

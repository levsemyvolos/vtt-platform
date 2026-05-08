export interface UserPublic {
  id: string;
  email: string;
  name: string;
  /** UUID of the room this Observer token is bound to. Present only when the user is an Observer. */
  boundRoomId?: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserPublic;
}

import type { Role, BackgroundFit } from '../shared/index';

export interface RoomMemberDTO {
  userId: string;
  name: string;
  role: Role;
  characterId?: string;
}

export interface RoomDTO {
  id: string;
  name: string;
  description?: string;
  gameSystem: string;
  status: 'lobby' | 'active' | 'closed';
  ownerId: string;
  members: RoomMemberDTO[];
  createdAt: string;
  lastActiveAt: string;
}

export interface CreateRoomRequest {
  name: string;
  gameSystem: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface ObserverJoinRequest {
  inviteCode: string;
  name: string;
}

export interface ObserverJoinResponse extends AuthTokenPair {
  roomId: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface DiceRollRequest {
  expression: string;
  label?: string;
}

export interface CreateSceneRequest {
  name: string;
  gridSize: number;
  gridWidth?: number;
  gridHeight?: number;
  backgroundAssetId?: string;
}

export interface UpdateSceneRequest {
  name?: string;
  gridSize?: number;
  gridWidth?: number;
  gridHeight?: number;
  gridVisible?: boolean;
  backgroundAssetId?: string | null;
  isHidden?: boolean;
  backgroundFit?: BackgroundFit;
  backgroundOffsetX?: number;
  backgroundOffsetY?: number;
  backgroundScale?: number;
}

export interface AIImageRequest {
  prompt: string;
  roomId: string;
  style?: string;
}

export interface AIImageResponse {
  previewUrl: string;
  assetId: string;
}

export interface AIMusicRequest {
  prompt: string;
  roomId: string;
  durationSec?: number;
}

export interface AIMusicResponse {
  previewUrl: string;
  assetId: string;
}

/**
 * Structural equivalent of the W3C `RTCIceServer` dictionary (lib.dom.d.ts).
 * Defined in shared so the server (no DOM lib) can produce it and the client
 * can pass it directly to `new RTCPeerConnection({ iceServers })`.
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnConfigResponse {
  iceServers: IceServer[];
  /** Unix seconds when HMAC credentials expire (RFC 7635 timed-credential). */
  ttlSecondsRemaining: number;
}

// ---------- Чат 7.1 — кампанійні матеріали (Ф7 + Ф9) + S10 Journal ----------
export * from './journal';
export * from './characters';
export * from './character_5e';
export * from './initiative';

// ---------- Чат 7.4 — token CRUD (Ф2.5) ----------
export interface CreateTokenRequest {
  name: string;
  x: number;
  y: number;
  imageAssetId?: string;
  color?: string;
  assignedUserId?: string;
}

export interface UpdateTokenRequest {
  name?: string;
  hp?: number | null;
  maxHp?: number | null;
  color?: string;
  statusMarkers?: string[];
  assignedUserId?: string | null;
  isHidden?: boolean;
  /** UUID of an uploaded Asset to use as token image. */
  imageAssetId?: string | null;
}

// ---------- Чат 7.2 — музичний супровід (Ф6) ----------
export * from './audio';

// ---------- Чат 7.5 — room members (R6 γ-variant) ----------
export interface RoomMembersResponse {
  gm: UserPublic;
  players: UserPublic[];
  observers: UserPublic[];
}

// ---------- Чат 7.6 — AI Assistant text (Ф8.1) ----------
export * from './ai';

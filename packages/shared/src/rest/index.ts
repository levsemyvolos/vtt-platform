export interface UserPublic {
  id: string;
  email: string;
  name: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserPublic;
}

import type { Role } from '../shared/index';

export interface RoomMemberDTO {
  userId: string;
  name: string;
  role: Role;
  characterId?: string;
}

export interface RoomDTO {
  id: string;
  name: string;
  gameSystem: string;
  status: 'lobby' | 'active' | 'closed';
  ownerId: string;
  members: RoomMemberDTO[];
  createdAt: string;
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
  backgroundAssetId?: string | null;
  isHidden?: boolean;
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

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

export type ParticipantRole = 'GM' | 'Player' | 'Observer';

export interface RoomMemberDTO {
  userId: string;
  name: string;
  role: ParticipantRole;
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

export interface DiceRollRequest {
  expression: string;
  label?: string;
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

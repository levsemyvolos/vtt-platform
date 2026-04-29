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

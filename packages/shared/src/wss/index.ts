import type { TokenPublicDTO, ChatMessageDTO, InitiativeEntryDTO } from '../shared/index';

export interface TokenMovePayload {
  tokenId: string;
  x: number;
  y: number;
  sceneId: string;
  clientSeq: number;
}

export interface SceneUpdatedPayload {
  sceneId: string;
  version: number;
  tokens: TokenPublicDTO[];
}

export interface ChatDicePayload {
  roomId: string;
  userId: string;
  expression: string;
  total: number;
  rolls: number[];
}

export interface SessionResyncPayload {
  sceneId: string;
  tokens: TokenPublicDTO[];
  messages: ChatMessageDTO[];
  initiatives: InitiativeEntryDTO[];
  serverTime: number;
}

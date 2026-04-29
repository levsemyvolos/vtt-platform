export interface TokenPublicDTO {
  id: string;
  name: string;
  x: number;
  y: number;
  sceneId: string;
  imageUrl: string;
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
  text?: string;
  rollPayload?: {
    expression: string;
    total: number;
    rolls: number[];
  };
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

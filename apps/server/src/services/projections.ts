import type { Scene, Token, ChatMessage, InitiativeEntry } from '@prisma/client';
import type {
  TokenPublicDTO,
  SceneDTO,
  ChatMessageDTO,
  InitiativeEntryDTO,
  Role,
  ChatMode,
  DiceMode,
  StatusMarker,
  BackgroundFit,
} from '@vtt/shared';
import { AssetService } from './AssetService.js';
import { parseAnnotations, parseFogShapes } from './DrawService.js';

/**
 * A6 RBAC-projection of Token → TokenPublicDTO (§2.17.6).
 *
 * Invariants:
 * - hidden tokens (`isHidden=true`) are NOT included for non-GM viewers (caller must filter
 *   the input array; this function returns null in that case).
 * - Observer never receives `hp` / `statusMarkers`.
 * - The owning Player and GM receive full data.
 *
 * @param token Prisma Token row
 * @param viewerRole role of the user receiving the DTO
 * @param viewerId UUID of the viewer (compared to assignedUserId for owner-check)
 * @returns DTO or null if the token must be hidden from this viewer
 */
export function projectToken(
  token: Token,
  viewerRole: Role,
  viewerId: string,
): TokenPublicDTO | null {
  if (token.isHidden && viewerRole !== 'GM') return null;

  const isOwner = token.assignedUserId === viewerId;
  const seesPrivateFields = viewerRole === 'GM' || isOwner;

  const dto: TokenPublicDTO = {
    id: token.id,
    name: token.name,
    x: token.x,
    y: token.y,
    sceneId: token.sceneId,
    imageUrl: token.imageAssetId ? AssetService.getProxyUrl(token.imageAssetId) : '',
    version: token.version,
    color: token.color ?? '#7c5cff',
    assignedUserId: token.assignedUserId,
  };
  if (seesPrivateFields) {
    if (token.hp !== null) dto.hp = token.hp;
    if (token.maxHp !== null) dto.maxHp = token.maxHp;
    dto.statusMarkers = token.statusMarkers as StatusMarker[];
  }
  return dto;
}

export function projectScene(
  scene: Scene & { tokens: Token[] },
  viewerRole: Role,
  viewerId: string,
): SceneDTO {
  const tokens: TokenPublicDTO[] = [];
  for (const t of scene.tokens) {
    const projected = projectToken(t, viewerRole, viewerId);
    if (projected) tokens.push(projected);
  }
  const annotations = parseAnnotations(scene.annotations);
  return {
    id: scene.id,
    roomId: scene.roomId,
    name: scene.name,
    gridSize: scene.gridSize,
    gridWidth: scene.gridWidth,
    gridHeight: scene.gridHeight,
    gridVisible: scene.gridVisible,
    isActive: scene.isActive,
    isHidden: scene.isHidden,
    fogShapes: parseFogShapes(scene.fogShapes),
    backgroundUrl: scene.backgroundAssetId ? AssetService.getProxyUrl(scene.backgroundAssetId) : null,
    backgroundFit: (scene.backgroundFit as BackgroundFit) ?? 'cover',
    backgroundOffsetX: scene.backgroundOffsetX,
    backgroundOffsetY: scene.backgroundOffsetY,
    backgroundScale: scene.backgroundScale,
    tokens,
    annotations,
  };
}

/**
 * Projects ChatMessage entity (with optional rollPayload JSON) to DTO.
 * Whisper / secret_roll filtering is performed upstream — this function
 * trusts that the caller decided this viewer is allowed to see the row.
 */
export function projectChatMessage(msg: ChatMessage): ChatMessageDTO {
  const dto: ChatMessageDTO = {
    id: msg.id,
    roomId: msg.roomId,
    userId: msg.senderId ?? '',
    mode: msg.mode as ChatMode,
    createdAt: msg.createdAt.toISOString(),
  };
  if (msg.body) dto.text = msg.body;
  if (msg.recipientId) dto.recipientId = msg.recipientId;
  if (msg.rollPayload) {
    const r = msg.rollPayload as {
      expression: string;
      total: number;
      rolls: number[];
      mode: DiceMode;
    };
    dto.rollPayload = r;
  }
  return dto;
}

export function projectInitiative(entry: InitiativeEntry): InitiativeEntryDTO {
  return {
    id: entry.id,
    name: entry.name,
    initiative: entry.initiative,
    orderIndex: entry.orderIndex,
    isCurrent: entry.isCurrent,
  };
}

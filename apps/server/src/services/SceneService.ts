import { randomUUID } from 'crypto';
import type { Scene, Token, Prisma } from '@prisma/client';
import type {
  OccResult,
  TokenMovePayload,
  VisibilityMatrix,
  Role,
  SceneDTO,
  CreateSceneRequest,
  UpdateSceneRequest,
  CreateTokenRequest,
  UpdateTokenRequest,
  SceneUpdatedPayload,
} from '@vtt/shared';
import { SceneRepository, type SceneWithTokens } from '../repositories/SceneRepository.js';
import { TokenRepository } from '../repositories/TokenRepository.js';
import { HttpError } from '../lib/errors.js';
import { projectScene, projectToken } from './projections.js';

interface BresenhamCtx {
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  err: number;
}

function stepBresenham(ctx: BresenhamCtx): void {
  const e2 = ctx.err * 2;
  if (e2 > -ctx.dy) {
    ctx.err -= ctx.dy;
    ctx.cx += ctx.sx;
  }
  if (e2 < ctx.dx) {
    ctx.err += ctx.dx;
    ctx.cy += ctx.sy;
  }
}

function isBlocker(
  mask: boolean[][],
  x: number,
  y: number,
  endX: number,
  endY: number,
): boolean {
  const col = mask[x];
  if (!col || col[y] === undefined) return true;
  if (x === endX && y === endY) return false;
  return col[y] === true;
}

export class SceneService {
  constructor(
    private readonly scenes: SceneRepository,
    private readonly tokens: TokenRepository,
  ) {}

  /**
   * Optional hook fired after a successful `setActiveScene` (Ф2.4). Used by
   * `AudioService.handleSceneSwitch` (Ф6.4) without coupling SceneService to
   * the audio module — the wire-up lives in `index.ts`.
   */
  onSceneActivated?: (roomId: string, sceneId: string) => void;

  // -------- A2: OCC token-move --------

  /**
   * Algorithm A2 (§2.17.3) — optimistic concurrency control for token movement.
   * Three branches:
   *  - accepted   : clientSeq == Token.version → updated, version++, broadcast
   *  - rollback   : clientSeq <  Token.version → stale; only requester is notified
   *  - discarded  : clientSeq >  Token.version → impossible in normal flow; ignored
   *
   * Returns a discriminated union; the socket handler decides whom to notify.
   * The DB write is OCC-guarded by TokenRepository.updatePositionWithVersion.
   *
   * @param payload TokenMovePayload from the client
   * @param viewerRole role of the requesting socket
   * @param viewerId UUID of the requesting user
   */
  async applyTokenMove(
    payload: TokenMovePayload,
    viewerRole: Role,
    viewerId: string,
  ): Promise<OccResult> {
    const token = await this.tokens.findById(payload.tokenId);
    if (!token) throw new HttpError(404, 'Token not found');
    if (token.sceneId !== payload.sceneId) {
      throw new HttpError(400, 'Scene mismatch');
    }
    if (viewerRole !== 'GM' && token.assignedUserId !== viewerId) {
      throw new HttpError(403, 'Only the GM or assigned player can move this token');
    }

    if (payload.clientSeq > token.version) {
      return { kind: 'discarded', reason: 'clientSeq greater than server version' };
    }
    if (payload.clientSeq < token.version) {
      return {
        kind: 'rollback',
        rollback: {
          tokenId: token.id,
          x: token.x,
          y: token.y,
          version: token.version,
        },
      };
    }

    // happy path: clientSeq == Token.version
    const updated = await this.tokens.updatePositionWithVersion(
      token.id,
      token.version,
      payload.x,
      payload.y,
    );
    if (!updated) {
      // race lost — another writer incremented the version between read and write
      const fresh = await this.tokens.findById(token.id);
      if (!fresh) throw new HttpError(404, 'Token vanished mid-update');
      return {
        kind: 'rollback',
        rollback: {
          tokenId: fresh.id,
          x: fresh.x,
          y: fresh.y,
          version: fresh.version,
        },
      };
    }

    // Build SceneUpdated payload from a fresh tokens snapshot, projected per A6.
    const sceneTokens = await this.tokens.listBySceneId(token.sceneId);
    const projected = sceneTokens
      .map((t) => projectToken(t, viewerRole, viewerId))
      .filter((t): t is NonNullable<typeof t> => t !== null);

    return {
      kind: 'accepted',
      sceneUpdate: {
        sceneId: token.sceneId,
        version: updated.version,
        tokens: projected,
      },
    };
  }

  // -------- A4: Fog-of-War visibility --------

  /**
   * Algorithm A4 (§2.17.5) — Bresenham line-of-sight visibility from a token.
   *
   * Returns a `boolean[width][height]` matrix where `true` means visible.
   * Cells outside the grid are clamped. Cells whose Bresenham line crosses
   * any blocker in `sceneMask` are marked `false`.
   *
   * Invariant: This function only computes geometry. The caller (SceneService
   * / handler) must use the matrix to filter tokens before composing the
   * SceneUpdatedPayload — A4 + A6 RBAC interaction.
   *
   * @param sceneMask boolean[W][H] where `true` = blocker (wall, opaque cell)
   * @param tokenPos cell coords of the viewer
   * @param radius max view distance in cells (Chebyshev / square)
   */
  computeVisibility(
    sceneMask: boolean[][],
    tokenPos: { x: number; y: number },
    radius: number,
  ): VisibilityMatrix {
    const width = sceneMask.length;
    const height = width === 0 ? 0 : (sceneMask[0]?.length ?? 0);
    const visibility: VisibilityMatrix = Array.from({ length: width }, () =>
      new Array<boolean>(height).fill(false),
    );
    if (width === 0 || height === 0) return visibility;

    const x0 = Math.max(0, Math.min(width - 1, Math.floor(tokenPos.x)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(tokenPos.y)));

    const xMin = Math.max(0, x0 - radius);
    const xMax = Math.min(width - 1, x0 + radius);
    const yMin = Math.max(0, y0 - radius);
    const yMax = Math.min(height - 1, y0 + radius);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        if (this.lineOfSightClear(sceneMask, x0, y0, x, y)) {
          const col = visibility[x];
          if (col) col[y] = true;
        }
      }
    }
    return visibility;
  }

  /**
   * Bresenham's line algorithm — returns true if no cell on the line from
   * (x0,y0) to (x1,y1), exclusive of the start, is a blocker.
   *
   * The start cell is always visible (it's where the viewer stands). The end
   * cell is visible if the line reaches it.
   */
  private lineOfSightClear(
    mask: boolean[][],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean {
    const ctx: BresenhamCtx = {
      cx: x0,
      cy: y0,
      x1,
      y1,
      dx: Math.abs(x1 - x0),
      dy: Math.abs(y1 - y0),
      sx: x0 < x1 ? 1 : -1,
      sy: y0 < y1 ? 1 : -1,
      err: 0,
    };
    ctx.err = ctx.dx - ctx.dy;
    const maxSteps = ctx.dx + ctx.dy + 2;
    for (let step = 0; step < maxSteps; step++) {
      if (ctx.cx === x1 && ctx.cy === y1) return true;
      stepBresenham(ctx);
      if (isBlocker(mask, ctx.cx, ctx.cy, x1, y1)) return false;
    }
    return false;
  }

  // -------- CRUD: Ф2.3, Ф2.4 --------

  /**
   * Creates a new Scene (Ф2.3). Caller must be GM of the room — RBAC enforced
   * at the route layer (`requireRole('GM')`), not here.
   */
  async createScene(roomId: string, dto: CreateSceneRequest): Promise<Scene> {
    return this.scenes.create({
      id: randomUUID(),
      room: { connect: { id: roomId } },
      name: dto.name,
      gridSize: dto.gridSize,
      gridWidth: dto.gridWidth ?? 40,
      gridHeight: dto.gridHeight ?? 40,
      ...(dto.backgroundAssetId
        ? { backgroundAsset: { connect: { id: dto.backgroundAssetId } } }
        : {}),
    });
  }

  async updateScene(sceneId: string, dto: UpdateSceneRequest): Promise<Scene> {
    const data: Parameters<SceneRepository['update']>[1] = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gridSize !== undefined) data.gridSize = dto.gridSize;
    if (dto.gridWidth !== undefined) data.gridWidth = dto.gridWidth;
    if (dto.gridHeight !== undefined) data.gridHeight = dto.gridHeight;
    if (dto.isHidden !== undefined) data.isHidden = dto.isHidden;
    if (dto.backgroundAssetId !== undefined) {
      data.backgroundAsset = dto.backgroundAssetId
        ? { connect: { id: dto.backgroundAssetId } }
        : { disconnect: true };
    }
    return this.scenes.update(sceneId, data);
  }

  /**
   * Activates the given scene in a room, deactivating others atomically (Ф2.4).
   */
  async setActiveScene(roomId: string, sceneId: string): Promise<void> {
    const scene = await this.scenes.findById(sceneId);
    if (!scene) throw new HttpError(404, 'Scene not found');
    if (scene.roomId !== roomId) throw new HttpError(400, 'Scene does not belong to room');
    await this.scenes.setActive(roomId, sceneId);
    this.onSceneActivated?.(roomId, sceneId);
  }

  /**
   * Snapshot for a viewer — used by SessionResyncService and REST GET.
   * Already projects tokens through A6.
   */
  async getSnapshot(
    sceneId: string,
    viewerRole: Role,
    viewerId: string,
  ): Promise<SceneDTO> {
    const scene = await this.scenes.findByIdWithTokens(sceneId);
    if (!scene) throw new HttpError(404, 'Scene not found');
    return projectScene(scene, viewerRole, viewerId);
  }

  async getActiveSnapshot(
    roomId: string,
    viewerRole: Role,
    viewerId: string,
  ): Promise<SceneDTO | null> {
    const scene: SceneWithTokens | null = await this.scenes.findActiveByRoomId(roomId);
    if (!scene) return null;
    return projectScene(scene, viewerRole, viewerId);
  }

  async getTokenSceneId(tokenId: string): Promise<string | null> {
    const token: Token | null = await this.tokens.findById(tokenId);
    return token?.sceneId ?? null;
  }

  async buildSceneUpdateForViewer(
    sceneId: string,
    version: number,
    viewerRole: Role,
    viewerId: string,
  ): Promise<SceneUpdatedPayload> {
    const sceneTokens = await this.tokens.listBySceneId(sceneId);
    const tokens = sceneTokens
      .map((t) => projectToken(t, viewerRole, viewerId))
      .filter((t): t is NonNullable<typeof t> => t !== null);
    return { sceneId, version, tokens };
  }

  async createToken(sceneId: string, dto: CreateTokenRequest): Promise<Token> {
    const scene = await this.scenes.findById(sceneId);
    if (!scene) throw new HttpError(404, 'Scene not found');
    return this.tokens.create({
      id: randomUUID(),
      scene: { connect: { id: sceneId } },
      name: dto.name,
      x: dto.x,
      y: dto.y,
      ...(dto.imageAssetId ? { imageAsset: { connect: { id: dto.imageAssetId } } } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
      ...(dto.assignedUserId ? { assignedUser: { connect: { id: dto.assignedUserId } } } : {}),
    });
  }

  async updateToken(
    tokenId: string,
    patch: UpdateTokenRequest,
    requesterRole: Role,
  ): Promise<Token> {
    if (requesterRole !== 'GM') throw new HttpError(403, 'Only GM can edit tokens');
    const token = await this.tokens.findById(tokenId);
    if (!token) throw new HttpError(404, 'Token not found');
    return this.tokens.update(tokenId, this.buildTokenUpdateData(patch));
  }

  private buildTokenUpdateData(patch: UpdateTokenRequest): Prisma.TokenUpdateInput {
    const data: Prisma.TokenUpdateInput = { version: { increment: 1 } };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.hp !== undefined) data.hp = patch.hp;
    if (patch.maxHp !== undefined) data.maxHp = patch.maxHp;
    if (patch.color !== undefined) data.color = patch.color;
    if (patch.statusMarkers !== undefined) data.statusMarkers = patch.statusMarkers;
    if (patch.isHidden !== undefined) data.isHidden = patch.isHidden;
    this.assignTokenRelations(data, patch);
    return data;
  }

  private assignTokenRelations(data: Prisma.TokenUpdateInput, patch: UpdateTokenRequest): void {
    if (patch.assignedUserId !== undefined) {
      data.assignedUser = patch.assignedUserId
        ? { connect: { id: patch.assignedUserId } }
        : { disconnect: true };
    }
    if (patch.imageAssetId !== undefined) {
      data.imageAsset = patch.imageAssetId
        ? { connect: { id: patch.imageAssetId } }
        : { disconnect: true };
    }
  }

  async deleteToken(tokenId: string, requesterRole: Role): Promise<void> {
    if (requesterRole !== 'GM') throw new HttpError(403, 'Only GM can delete tokens');
    const token = await this.tokens.findById(tokenId);
    if (!token) throw new HttpError(404, 'Token not found');
    await this.tokens.delete(tokenId);
  }
}

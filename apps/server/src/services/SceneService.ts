import { randomUUID } from 'crypto';
import type { Scene, Token } from '@prisma/client';
import type {
  OccResult,
  TokenMovePayload,
  VisibilityMatrix,
  Role,
  SceneDTO,
  CreateSceneRequest,
  UpdateSceneRequest,
} from '@vtt/shared';
import { SceneRepository, type SceneWithTokens } from '../repositories/SceneRepository.js';
import { TokenRepository } from '../repositories/TokenRepository.js';
import { HttpError } from '../lib/errors.js';
import { projectScene, projectToken } from './projections.js';

export class SceneService {
  constructor(
    private readonly scenes: SceneRepository,
    private readonly tokens: TokenRepository,
  ) {}

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
   * Note: the start cell itself is always considered visible (it's where the
   * viewer stands). The end cell is visible if the line reaches it.
   */
  private lineOfSightClear(
    mask: boolean[][],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean {
    let cx = x0;
    let cy = y0;
    const dx = Math.abs(x1 - cx);
    const dy = Math.abs(y1 - cy);
    const sx = cx < x1 ? 1 : -1;
    const sy = cy < y1 ? 1 : -1;
    let err = dx - dy;
    // safety bound — prevents infinite loops on pathological input
    const maxSteps = dx + dy + 2;
    for (let step = 0; step < maxSteps; step++) {
      if (cx === x1 && cy === y1) return true;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
      // out-of-bounds = blocked
      const col = mask[cx];
      if (!col || col[cy] === undefined) return false;
      if (col[cy] === true && !(cx === x1 && cy === y1)) return false;
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
}

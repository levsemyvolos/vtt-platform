import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Token } from '@prisma/client';
import { SceneService } from '../../src/services/SceneService.js';
import type { SceneRepository } from '../../src/repositories/SceneRepository.js';
import type { TokenRepository } from '../../src/repositories/TokenRepository.js';

const baseToken: Token = {
  id: 'tok-1',
  sceneId: 'scene-1',
  assignedUserId: 'user-1',
  imageAssetId: null,
  x: 0,
  y: 0,
  name: 'Hero',
  hp: 12,
  statusMarkers: [],
  isHidden: false,
  version: 5,
  visionRadius: 6,
};

function makeSceneRepo(): SceneRepository {
  return {
    findById: vi.fn(),
    findByIdWithTokens: vi.fn(),
    findActiveByRoomId: vi.fn(),
    listByRoomId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
  } as unknown as SceneRepository;
}

function makeTokenRepo(overrides: Partial<TokenRepository> = {}): TokenRepository {
  return {
    findById: vi.fn().mockResolvedValue(baseToken),
    listBySceneId: vi.fn().mockResolvedValue([baseToken]),
    create: vi.fn(),
    updatePositionWithVersion: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as TokenRepository;
}

describe('SceneService.applyTokenMove (algorithm A2 OCC, §2.17.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepted: clientSeq == version → version++ and SceneUpdated emitted', async () => {
    const tokenRepo = makeTokenRepo({
      updatePositionWithVersion: vi
        .fn()
        .mockResolvedValue({ ...baseToken, x: 5, y: 7, version: 6 }),
      listBySceneId: vi
        .fn()
        .mockResolvedValue([{ ...baseToken, x: 5, y: 7, version: 6 }]),
    });
    const svc = new SceneService(makeSceneRepo(), tokenRepo);
    const r = await svc.applyTokenMove(
      { tokenId: 'tok-1', x: 5, y: 7, sceneId: 'scene-1', clientSeq: 5 },
      'GM',
      'gm-1',
    );
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.sceneUpdate.version).toBe(6);
      expect(r.sceneUpdate.tokens[0]?.version).toBe(6);
    }
    expect(tokenRepo.updatePositionWithVersion).toHaveBeenCalledWith('tok-1', 5, 5, 7);
  });

  it('rollback: clientSeq < version → returns rollback with current server pos', async () => {
    const svc = new SceneService(makeSceneRepo(), makeTokenRepo());
    const r = await svc.applyTokenMove(
      { tokenId: 'tok-1', x: 99, y: 99, sceneId: 'scene-1', clientSeq: 3 },
      'Player',
      'user-1',
    );
    expect(r.kind).toBe('rollback');
    if (r.kind === 'rollback') {
      expect(r.rollback.tokenId).toBe('tok-1');
      expect(r.rollback.version).toBe(5);
      expect(r.rollback.x).toBe(0);
      expect(r.rollback.y).toBe(0);
    }
  });

  it('discarded: clientSeq > version (impossible in steady state) → discarded', async () => {
    const svc = new SceneService(makeSceneRepo(), makeTokenRepo());
    const r = await svc.applyTokenMove(
      { tokenId: 'tok-1', x: 1, y: 1, sceneId: 'scene-1', clientSeq: 99 },
      'Player',
      'user-1',
    );
    expect(r.kind).toBe('discarded');
  });

  it('race lost mid-update (updateMany returns null) → rollback fallback', async () => {
    const tokenRepo = makeTokenRepo({
      updatePositionWithVersion: vi.fn().mockResolvedValue(null),
      findById: vi
        .fn()
        // first call (in applyTokenMove start) returns baseToken
        .mockResolvedValueOnce(baseToken)
        // second call (after race detected) returns the post-race state
        .mockResolvedValueOnce({ ...baseToken, x: 11, y: 11, version: 7 }),
    });
    const svc = new SceneService(makeSceneRepo(), tokenRepo);
    const r = await svc.applyTokenMove(
      { tokenId: 'tok-1', x: 5, y: 5, sceneId: 'scene-1', clientSeq: 5 },
      'Player',
      'user-1',
    );
    expect(r.kind).toBe('rollback');
    if (r.kind === 'rollback') expect(r.rollback.version).toBe(7);
  });

  it('hidden token is filtered out for non-GM in the SceneUpdated payload', async () => {
    const hidden: Token = { ...baseToken, id: 'tok-hidden', isHidden: true };
    const visible: Token = baseToken;
    const tokenRepo = makeTokenRepo({
      findById: vi.fn().mockResolvedValue(visible),
      listBySceneId: vi.fn().mockResolvedValue([visible, hidden]),
      updatePositionWithVersion: vi
        .fn()
        .mockResolvedValue({ ...visible, x: 1, y: 1, version: 6 }),
    });
    const svc = new SceneService(makeSceneRepo(), tokenRepo);
    const r = await svc.applyTokenMove(
      { tokenId: 'tok-1', x: 1, y: 1, sceneId: 'scene-1', clientSeq: 5 },
      'Player',
      'user-1',
    );
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      const ids = r.sceneUpdate.tokens.map((t) => t.id);
      expect(ids).not.toContain('tok-hidden');
      expect(ids).toContain('tok-1');
    }
  });
});

describe('SceneService.computeVisibility (algorithm A4 Bresenham LOS, §2.17.5)', () => {
  const svc = new SceneService(makeSceneRepo(), makeTokenRepo());

  function emptyMask(w: number, h: number): boolean[][] {
    return Array.from({ length: w }, () => new Array<boolean>(h).fill(false));
  }

  it('center cell of an open 5x5 grid sees all cells within radius', () => {
    const mask = emptyMask(5, 5);
    const vis = svc.computeVisibility(mask, { x: 2, y: 2 }, 2);
    let visible = 0;
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) if (vis[x]?.[y]) visible++;
    expect(visible).toBe(25);
  });

  it('a wall blocks the cell behind it', () => {
    const mask = emptyMask(5, 5);
    // place a blocker at (2,1) — cell (2,0) sits behind it from viewer (2,2)
    const col = mask[2];
    if (col) col[1] = true;
    const vis = svc.computeVisibility(mask, { x: 2, y: 2 }, 4);
    expect(vis[2]?.[0]).toBe(false);
  });

  it('cells outside radius are NOT marked visible', () => {
    const mask = emptyMask(10, 10);
    const vis = svc.computeVisibility(mask, { x: 5, y: 5 }, 1);
    // (5,5) is the viewer; (5,7) is distance 2 — outside radius 1
    expect(vis[5]?.[7]).toBe(false);
  });

  it('zero radius keeps only the viewer cell visible', () => {
    const mask = emptyMask(3, 3);
    const vis = svc.computeVisibility(mask, { x: 1, y: 1 }, 0);
    expect(vis[1]?.[1]).toBe(true);
    expect(vis[0]?.[0]).toBe(false);
    expect(vis[2]?.[2]).toBe(false);
  });

  it('empty mask returns empty matrix', () => {
    const vis = svc.computeVisibility([], { x: 0, y: 0 }, 5);
    expect(vis).toEqual([]);
  });

  it('viewer position outside grid is clamped (no crash)', () => {
    const mask = emptyMask(3, 3);
    const vis = svc.computeVisibility(mask, { x: -5, y: -5 }, 1);
    // clamped to (0,0); only that and immediate neighbours within radius are visible
    expect(vis[0]?.[0]).toBe(true);
  });
});

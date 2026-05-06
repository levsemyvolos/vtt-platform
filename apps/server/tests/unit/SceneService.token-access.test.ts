import { describe, expect, it, vi } from 'vitest';
import type { Token } from '@prisma/client';
import { SceneService } from '../../src/services/SceneService.js';
import type { SceneRepository } from '../../src/repositories/SceneRepository.js';
import type { TokenRepository } from '../../src/repositories/TokenRepository.js';

const token: Token = {
  id: 'tok-1',
  sceneId: 'scene-1',
  assignedUserId: 'owner-user',
  imageAssetId: null,
  x: 0,
  y: 0,
  name: 'Hero',
  hp: null,
  maxHp: null,
  color: null,
  statusMarkers: [],
  isHidden: false,
  version: 1,
  visionRadius: 6,
};

describe('SceneService token movement access', () => {
  it('rejects a player moving a token assigned to another user', async () => {
    const tokenRepo = {
      findById: vi.fn().mockResolvedValue(token),
      updatePositionWithVersion: vi.fn(),
      listBySceneId: vi.fn(),
    } as unknown as TokenRepository;
    const svc = new SceneService({} as SceneRepository, tokenRepo);

    await expect(
      svc.applyTokenMove(
        { tokenId: token.id, sceneId: token.sceneId, x: 4, y: 4, clientSeq: 1 },
        'Player',
        'other-user',
      ),
    ).rejects.toThrow('Only the GM or assigned player can move this token');
    expect(tokenRepo.updatePositionWithVersion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Regression: OCC multi-token bug — clientSeq must use per-token version,
// not a global scene version.
//
// Scenario: Token A has been moved twice (version: 2). Token B was just
// REST-created and has the Prisma default (version: 0). The client was
// incorrectly sending the global sceneVersion (2) as clientSeq for Token B,
// causing the server to return 'discarded' (clientSeq > token.version).
// ---------------------------------------------------------------------------

/** Token A — moved twice, version is now 2. */
const tokenA: Token = {
  id: 'tok-a',
  sceneId: 'scene-1',
  assignedUserId: null,
  imageAssetId: null,
  x: 10,
  y: 10,
  name: 'Veteran',
  hp: null,
  maxHp: null,
  color: null,
  statusMarkers: [],
  isHidden: false,
  version: 2,
  visionRadius: 6,
};

/** Token B — freshly REST-created, Prisma default version is 0. */
const tokenB: Token = {
  id: 'tok-b',
  sceneId: 'scene-1',
  assignedUserId: null,
  imageAssetId: null,
  x: 0,
  y: 0,
  name: 'Newcomer',
  hp: null,
  maxHp: null,
  color: null,
  statusMarkers: [],
  isHidden: false,
  version: 0,
  visionRadius: 6,
};

/** Minimal updated Token B returned after a successful position write. */
const tokenBUpdated: Token = { ...tokenB, x: 3, y: 5, version: 1 };

describe('SceneService OCC — multi-token regression (per-token version)', () => {
  it('accepts Token B move when clientSeq matches its own version (0)', async () => {
    const tokenRepo = {
      findById: vi.fn().mockResolvedValue(tokenB),
      updatePositionWithVersion: vi.fn().mockResolvedValue(tokenBUpdated),
      listBySceneId: vi.fn().mockResolvedValue([tokenA, tokenBUpdated]),
    } as unknown as TokenRepository;
    const svc = new SceneService({} as SceneRepository, tokenRepo);

    const result = await svc.applyTokenMove(
      { tokenId: tokenB.id, sceneId: tokenB.sceneId, x: 3, y: 5, clientSeq: tokenB.version },
      'GM',
      'gm-user',
    );

    expect(result.kind).toBe('accepted');
  });

  it('discards Token B move when clientSeq uses the stale global sceneVersion (2)', async () => {
    // This is the exact wrong value the client was sending before the fix:
    // it read state.scene.version (2, from Token A's two accepted moves)
    // instead of token.version (0 for the fresh Token B).
    const staleGlobalSceneVersion = tokenA.version; // 2

    const tokenRepo = {
      findById: vi.fn().mockResolvedValue(tokenB),
      updatePositionWithVersion: vi.fn(),
      listBySceneId: vi.fn(),
    } as unknown as TokenRepository;
    const svc = new SceneService({} as SceneRepository, tokenRepo);

    const result = await svc.applyTokenMove(
      { tokenId: tokenB.id, sceneId: tokenB.sceneId, x: 3, y: 5, clientSeq: staleGlobalSceneVersion },
      'GM',
      'gm-user',
    );

    expect(result.kind).toBe('discarded');
    // The DB write must NOT have been attempted on a discarded move.
    expect(tokenRepo.updatePositionWithVersion).not.toHaveBeenCalled();
  });
});

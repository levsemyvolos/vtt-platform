import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneService } from '../../src/services/SceneService.js';
import type { SceneRepository } from '../../src/repositories/SceneRepository.js';
import type { TokenRepository } from '../../src/repositories/TokenRepository.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
    findById: vi.fn(),
    listBySceneId: vi.fn(),
    create: vi.fn(),
    updatePositionWithVersion: vi.fn(),
    bulkUpdatePositions: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as TokenRepository;
}

// ---------------------------------------------------------------------------
// Tests — SceneService.applyTokenSnapshot (Sess 5.5 Mini-C)
// ---------------------------------------------------------------------------

describe('SceneService.applyTokenSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates bulk x/y update to tokenRepo for all tokens in the list', async () => {
    const tokenRepo = makeTokenRepo();
    const svc = new SceneService(makeSceneRepo(), tokenRepo);

    const snapshot = [
      { id: 'tok-1', x: 3, y: 7 },
      { id: 'tok-2', x: 10, y: 2 },
    ];
    await svc.applyTokenSnapshot('scene-1', snapshot);

    expect(tokenRepo.bulkUpdatePositions).toHaveBeenCalledOnce();
    expect(tokenRepo.bulkUpdatePositions).toHaveBeenCalledWith('scene-1', snapshot);
  });

  it('is a no-op when the snapshot list is empty — bulkUpdatePositions not called', async () => {
    const tokenRepo = makeTokenRepo();
    const svc = new SceneService(makeSceneRepo(), tokenRepo);

    await svc.applyTokenSnapshot('scene-1', []);

    expect(tokenRepo.bulkUpdatePositions).not.toHaveBeenCalled();
  });

  it('does not bump version — bulkUpdatePositions receives only id/x/y', async () => {
    const tokenRepo = makeTokenRepo();
    const svc = new SceneService(makeSceneRepo(), tokenRepo);

    const snapshot = [{ id: 'tok-1', x: 5, y: 9 }];
    await svc.applyTokenSnapshot('scene-x', snapshot);

    // The payload passed to bulkUpdatePositions must only contain id, x, y —
    // no version field — confirming OCC is intentionally bypassed.
    const call = (tokenRepo.bulkUpdatePositions as ReturnType<typeof vi.fn>).mock.calls[0];
    const passedTokens = call?.[1] as Array<{ id: string; x: number; y: number }>;
    expect(passedTokens[0]).toStrictEqual({ id: 'tok-1', x: 5, y: 9 });
    expect(Object.keys(passedTokens[0] ?? {})).not.toContain('version');
  });
});

// ---------------------------------------------------------------------------
// Tests — TokenRepository.bulkUpdatePositions (Sess 5.5 Mini-C)
// ---------------------------------------------------------------------------

describe('TokenRepository.bulkUpdatePositions — defensive sceneId filter', () => {
  it('passes sceneId in each WHERE clause to prevent cross-scene collisions', async () => {
    // We test the repository method contract directly by asserting that the
    // WHERE clause includes sceneId. Because we cannot run Prisma against a
    // real DB in unit tests, we mock $transaction to capture the prisma call
    // arguments via the update builder instead.
    //
    // The actual SQL correctness is covered by integration / e2e tests.
    // Here we verify the structural contract (sceneId is in where) to catch
    // accidental regressions without a DB.

    const updateMock = vi.fn().mockReturnValue({ where: { id: 'tok-1', sceneId: 'scene-1' }, data: { x: 3, y: 7 } });
    const transactionMock = vi.fn().mockResolvedValue(undefined);

    const fakePrisma = {
      token: { update: updateMock },
      $transaction: transactionMock,
    };

    const { TokenRepository } = await import('../../src/repositories/TokenRepository.js');
    const repo = new TokenRepository(fakePrisma as never);

    await repo.bulkUpdatePositions('scene-1', [{ id: 'tok-1', x: 3, y: 7 }]);

    // The update call should include sceneId in its where clause
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tok-1', sceneId: 'scene-1' }),
        data: { x: 3, y: 7 },
      }),
    );
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it('calls $transaction with an empty array and skips early when list is empty', async () => {
    const transactionMock = vi.fn().mockResolvedValue(undefined);
    const updateMock = vi.fn();

    const fakePrisma = {
      token: { update: updateMock },
      $transaction: transactionMock,
    };

    const { TokenRepository } = await import('../../src/repositories/TokenRepository.js');
    const repo = new TokenRepository(fakePrisma as never);

    await repo.bulkUpdatePositions('scene-1', []);

    // bulkUpdatePositions guards with `if (tokens.length === 0) return`
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

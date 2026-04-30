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
  x: 2,
  y: 3,
  name: 'Hero',
  hp: 12,
  maxHp: 20,
  color: '#7c5cff',
  statusMarkers: [],
  isHidden: false,
  version: 3,
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
    update: vi.fn().mockResolvedValue({ ...baseToken, name: 'Patched', version: 4 }),
    delete: vi.fn().mockResolvedValue(baseToken),
    ...overrides,
  } as unknown as TokenRepository;
}

describe('SceneService.updateToken (§2.17 GM-edit flow)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GM update OK: name patch applied, version incremented', async () => {
    const tokenRepo = makeTokenRepo({
      update: vi.fn().mockResolvedValue({ ...baseToken, name: 'Renamed', version: 4 }),
    });
    const svc = new SceneService(makeSceneRepo(), tokenRepo);
    const result = await svc.updateToken('tok-1', { name: 'Renamed' }, 'GM');
    expect(result.name).toBe('Renamed');
    expect(result.version).toBe(4);
    expect(tokenRepo.update).toHaveBeenCalledOnce();
  });

  it('Player attempt → 403 Forbidden', async () => {
    const svc = new SceneService(makeSceneRepo(), makeTokenRepo());
    await expect(svc.updateToken('tok-1', { name: 'X' }, 'Player')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('version is monotonically increased via increment: 1 in update call', async () => {
    let capturedData: unknown;
    const tokenRepo = makeTokenRepo({
      update: vi.fn().mockImplementation((_id: string, data: unknown) => {
        capturedData = data;
        return Promise.resolve({ ...baseToken, version: 4 });
      }),
    });
    const svc = new SceneService(makeSceneRepo(), tokenRepo);
    await svc.updateToken('tok-1', { hp: 8 }, 'GM');
    expect(capturedData).toMatchObject({ version: { increment: 1 } });
  });

  it('deleteToken: GM can cascade-delete, repository.delete called', async () => {
    const tokenRepo = makeTokenRepo();
    const svc = new SceneService(makeSceneRepo(), tokenRepo);
    await expect(svc.deleteToken('tok-1', 'GM')).resolves.toBeUndefined();
    expect(tokenRepo.delete).toHaveBeenCalledWith('tok-1');
  });
});

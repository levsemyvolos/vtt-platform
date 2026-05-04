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

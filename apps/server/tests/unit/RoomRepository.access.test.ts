import { describe, expect, it, vi } from 'vitest';
import { RoomRepository } from '../../src/repositories/RoomRepository.js';

function makeRepo(ownerId = 'owner-1', memberRole: string | null = null) {
  const db = {
    room: {
      findUnique: vi.fn().mockResolvedValue({ ownerId }),
    },
    roomMember: {
      findFirst: vi.fn().mockResolvedValue(
        memberRole ? { id: 'member-1', role: memberRole } : null,
      ),
    },
  };
  return {
    repo: new RoomRepository(db as never),
    db,
  };
}

describe('RoomRepository room access resolution', () => {
  it('resolves owner as GM regardless of JWT role', async () => {
    const { repo } = makeRepo('user-1');
    await expect(repo.getRoleInRoom('room-1', 'user-1', 'Player')).resolves.toBe('GM');
  });

  it('resolves persisted members from RoomMember, not fallback JWT role', async () => {
    const { repo } = makeRepo('owner-1', 'Player');
    await expect(repo.getRoleInRoom('room-1', 'user-2', 'GM')).resolves.toBe('Player');
  });

  it('rejects non-members instead of trusting Player JWT fallback', async () => {
    const { repo } = makeRepo('owner-1');
    await expect(repo.getRoleInRoom('room-1', 'user-2', 'Player')).resolves.toBeNull();
  });

  it('allows observer only for the bound room', async () => {
    const { repo } = makeRepo('owner-1');
    await expect(
      repo.getRoleInRoom('room-1', 'observer-1', 'Observer', 'room-1'),
    ).resolves.toBe('Observer');
  });

  it('rejects observer tokens bound to another room', async () => {
    const { repo } = makeRepo('owner-1');
    await expect(
      repo.getRoleInRoom('room-1', 'observer-1', 'Observer', 'room-2'),
    ).resolves.toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { RoomRepository } from '../../src/repositories/RoomRepository.js';

/**
 * `getRoleInRoom` is consumed by `requireRoomGM` middleware on every AI
 * request, so it MUST resolve in a single round-trip. The mock asserts that:
 *   - the room+member join is fetched in one `room.findUnique` call;
 *   - `roomMember.findFirst`/`findMany` is never invoked separately.
 */
function makeRepo(
  ownerId = 'owner-1',
  memberRole: string | null = null,
  roomExists = true,
) {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const db = {
    room: {
      findUnique: vi.fn().mockResolvedValue(
        roomExists
          ? {
              ownerId,
              members: memberRole ? [{ role: memberRole }] : [],
            }
          : null,
      ),
    },
    roomMember: { findFirst, findMany },
  };
  return {
    repo: new RoomRepository(db as never),
    db,
    findFirst,
    findMany,
  };
}

describe('RoomRepository.getRoleInRoom — single-query role resolution', () => {
  it('resolves owner as GM regardless of JWT role', async () => {
    const { repo, findFirst } = makeRepo('user-1');
    await expect(repo.getRoleInRoom('room-1', 'user-1', 'Player')).resolves.toBe('GM');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('resolves persisted members from RoomMember, not fallback JWT role', async () => {
    const { repo } = makeRepo('owner-1', 'Player');
    await expect(repo.getRoleInRoom('room-1', 'user-2', 'GM')).resolves.toBe('Player');
  });

  it('treats stored Observer as Observer', async () => {
    const { repo } = makeRepo('owner-1', 'Observer');
    await expect(repo.getRoleInRoom('room-1', 'user-2', 'Player')).resolves.toBe('Observer');
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

  it('returns null when the room does not exist', async () => {
    const { repo } = makeRepo('owner-1', null, false);
    await expect(repo.getRoleInRoom('ghost', 'user-1', 'Player')).resolves.toBeNull();
  });

  it('uses a single SQL round-trip (no separate roomMember query)', async () => {
    const { repo, db, findFirst, findMany } = makeRepo('owner-1', 'Player');
    await repo.getRoleInRoom('room-1', 'user-2', 'Player');
    expect(db.room.findUnique).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});

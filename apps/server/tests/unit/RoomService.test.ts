import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomService } from '../../src/services/RoomService.js';
import type { RoomRepository, RoomWithOwner } from '../../src/repositories/RoomRepository.js';
import type { Room } from '@prisma/client';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-uuid',
    ownerId: 'owner-123',
    name: 'Test Room',
    gameSystem: 'D&D 5e',
    status: 'lobby',
    inviteTokenPlayer: 'pt-aaa',
    inviteTokenObserver: 'ot-bbb',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ...overrides,
  } as unknown as Room;
}

function makeRoomRepo(overrides: Partial<RoomRepository> = {}): RoomRepository {
  const capturedData: Partial<Room>[] = [];
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByOwnerId: vi.fn().mockResolvedValue([]),
    findByPlayerInviteToken: vi.fn().mockResolvedValue(null),
    findByObserverInviteToken: vi.fn().mockResolvedValue(null),
    findByUserAndRole: vi.fn().mockResolvedValue([]),
    getRoleInRoom: vi.fn().mockResolvedValue(null),
    updateById: vi.fn().mockResolvedValue(makeRoom()),
    deleteById: vi.fn().mockResolvedValue(makeRoom()),
    countByOwner: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation((data) => {
      capturedData.push(data as Partial<Room>);
      // Return a Room-like object using the data passed in
      return Promise.resolve({
        id: (data as { id: string }).id,
        ownerId: 'owner-123',
        name: (data as { name: string }).name,
        inviteTokenPlayer: (data as { inviteTokenPlayer: string }).inviteTokenPlayer,
        inviteTokenObserver: (data as { inviteTokenObserver: string }).inviteTokenObserver,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      } as Room);
    }),
    _capturedData: capturedData,
    ...overrides,
  } as unknown as RoomRepository & { _capturedData: Partial<Room>[] };
}

describe('RoomService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inviteTokenPlayer and inviteTokenObserver are different values', async () => {
    const repo = makeRoomRepo();
    const service = new RoomService(repo);

    const room = await service.create('owner-123', 'Test Room');

    expect(room.inviteTokenPlayer).not.toBe(room.inviteTokenObserver);
  });

  it('ownerId is set from the argument passed to create', async () => {
    const repo = makeRoomRepo();
    const service = new RoomService(repo);

    // Capture what was passed to repo.create
    let capturedOwnerId: string | undefined;
    vi.mocked(repo.create).mockImplementationOnce((data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma input type is opaque here
      const d = data as any;
      capturedOwnerId = d.owner?.connect?.id ?? d.ownerId;
      return Promise.resolve({
        id: 'room-uuid',
        ownerId: 'owner-123',
        name: 'Test Room',
        inviteTokenPlayer: 'aaa',
        inviteTokenObserver: 'bbb',
        createdAt: new Date(),
      } as Room);
    });

    await service.create('owner-123', 'Test Room');

    expect(capturedOwnerId).toBe('owner-123');
  });

  it('both invite tokens are non-empty strings of length > 0', async () => {
    const repo = makeRoomRepo();
    const service = new RoomService(repo);

    const room = await service.create('owner-123', 'Test Room');

    expect(typeof room.inviteTokenPlayer).toBe('string');
    expect(room.inviteTokenPlayer.length).toBeGreaterThan(0);
    expect(typeof room.inviteTokenObserver).toBe('string');
    expect(room.inviteTokenObserver.length).toBeGreaterThan(0);
  });
});

describe('RoomService.joinByInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the resolved Room when player invite token matches', async () => {
    const matchedRoom = {
      id: 'room-uuid',
      ownerId: 'owner-123',
      name: 'Found Room',
      inviteTokenPlayer: 'pt-aaa',
      inviteTokenObserver: 'pt-bbb',
    } as Room;
    const repo = makeRoomRepo({
      findByPlayerInviteToken: vi.fn().mockResolvedValue(matchedRoom),
    });
    const service = new RoomService(repo);

    const room = await service.joinByInvite('pt-aaa');

    expect(room.id).toBe('room-uuid');
    expect(repo.findByPlayerInviteToken).toHaveBeenCalledWith('pt-aaa');
  });

  it('throws 404 when invite token does not match any room', async () => {
    const repo = makeRoomRepo(); // findByPlayerInviteToken default → null
    const service = new RoomService(repo);

    await expect(service.joinByInvite('bogus-token')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('RoomService.joinAsObserver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the resolved Room when observer invite token matches', async () => {
    const matchedRoom = {
      id: 'room-obs',
      ownerId: 'owner-123',
      name: 'Observer Room',
      inviteTokenPlayer: 'pt-aaa',
      inviteTokenObserver: 'ot-zzz',
    } as Room;
    const repo = makeRoomRepo({
      findByObserverInviteToken: vi.fn().mockResolvedValue(matchedRoom),
    });
    const service = new RoomService(repo);

    const room = await service.joinAsObserver('ot-zzz');

    expect(room.id).toBe('room-obs');
    expect(repo.findByObserverInviteToken).toHaveBeenCalledWith('ot-zzz');
  });

  it('throws 404 when observer token does not match', async () => {
    const repo = makeRoomRepo();
    const service = new RoomService(repo);

    await expect(service.joinAsObserver('bogus')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('RoomService.listByUserAndRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filter=owned delegates to findByUserAndRole with "owned"', async () => {
    const findByUserAndRole = vi.fn().mockResolvedValue([]);
    const repo = makeRoomRepo({ findByUserAndRole } as unknown as Partial<RoomRepository>);
    const service = new RoomService(repo);

    await service.listByUserAndRole('u1', 'owned');

    expect(findByUserAndRole).toHaveBeenCalledWith('u1', 'owned', 'lastActive', 'desc');
  });

  it('filter=invited delegates to findByUserAndRole with "invited"', async () => {
    const findByUserAndRole = vi.fn().mockResolvedValue([]);
    const repo = makeRoomRepo({ findByUserAndRole } as unknown as Partial<RoomRepository>);
    const service = new RoomService(repo);

    await service.listByUserAndRole('u1', 'invited');

    expect(findByUserAndRole).toHaveBeenCalledWith('u1', 'invited', 'lastActive', 'desc');
  });

  it('defaults to "all" when no filter is passed', async () => {
    const findByUserAndRole = vi.fn().mockResolvedValue([]);
    const repo = makeRoomRepo({ findByUserAndRole } as unknown as Partial<RoomRepository>);
    const service = new RoomService(repo);

    await service.listByUserAndRole('u1');

    expect(findByUserAndRole).toHaveBeenCalledWith('u1', 'all', 'lastActive', 'desc');
  });
});

describe('RoomService.getMembersProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockPrisma(characters: Array<{ id: string; ownerId: string; ownerName: string }> = []) {
    return {
      character: {
        findMany: vi.fn().mockResolvedValue(
          characters.map((c) => ({
            id: c.id,
            ownerId: c.ownerId,
            owner: { id: c.ownerId, displayName: c.ownerName, email: `${c.ownerId}@x` },
          })),
        ),
      },
      // Wave 2.1 — RoomMember table (persistent membership). Return empty by default
      // so existing projection tests remain unaffected.
      roomMember: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    } as unknown as import('@prisma/client').PrismaClient;
  }

  it('always includes the GM (room owner) as first member', async () => {
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'r1',
        ownerId: 'gm-1',
        owner: { id: 'gm-1', displayName: 'Master', email: 'gm@x' },
      } as unknown as RoomWithOwner),
    });
    const service = new RoomService(repo, makeMockPrisma());

    const members = await service.getMembersProjection('r1');

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: 'gm-1', role: 'GM', name: 'Master' });
  });

  it('appends distinct Player owners after the GM', async () => {
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'r1',
        ownerId: 'gm-1',
        owner: { id: 'gm-1', displayName: 'Master', email: 'gm@x' },
      } as unknown as RoomWithOwner),
    });
    const service = new RoomService(
      repo,
      makeMockPrisma([
        { id: 'char-a', ownerId: 'pl-1', ownerName: 'Alice' },
        { id: 'char-b', ownerId: 'pl-2', ownerName: 'Bob' },
      ]),
    );

    const members = await service.getMembersProjection('r1');

    expect(members).toHaveLength(3);
    expect(members[0].role).toBe('GM');
    expect(members[1]).toMatchObject({ userId: 'pl-1', role: 'Player', name: 'Alice', characterId: 'char-a' });
    expect(members[2]).toMatchObject({ userId: 'pl-2', role: 'Player', name: 'Bob', characterId: 'char-b' });
  });

  it('skips a character whose owner is the GM (no duplicate entry)', async () => {
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'r1',
        ownerId: 'gm-1',
        owner: { id: 'gm-1', displayName: 'Master', email: 'gm@x' },
      } as unknown as RoomWithOwner),
    });
    const service = new RoomService(
      repo,
      makeMockPrisma([{ id: 'gm-char', ownerId: 'gm-1', ownerName: 'Master' }]),
    );

    const members = await service.getMembersProjection('r1');

    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('GM');
  });

  it('throws 404 when the room is missing', async () => {
    const repo = makeRoomRepo(); // findById default → null
    const service = new RoomService(repo, makeMockPrisma());

    await expect(service.getMembersProjection('nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Wave 4.1 — RoomService.update
// ──────────────────────────────────────────────────────────────────────────────

describe('RoomService.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateById and returns the updated Room when owner matches', async () => {
    const existingRoom = makeRoom({ id: 'r1', ownerId: 'gm-1' });
    const updatedRoom = makeRoom({ id: 'r1', name: 'New Name' });
    const updateById = vi.fn().mockResolvedValue(updatedRoom);
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({ ...existingRoom, owner: { id: 'gm-1', displayName: 'GM', email: 'gm@x' } }),
      updateById,
    });
    const service = new RoomService(repo);

    const result = await service.update('r1', 'gm-1', { name: 'New Name' });

    expect(updateById).toHaveBeenCalledWith('r1', expect.objectContaining({ name: 'New Name' }));
    expect(result.name).toBe('New Name');
  });

  it('throws 403 when requester is not the owner', async () => {
    const existingRoom = makeRoom({ id: 'r1', ownerId: 'gm-1' });
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({ ...existingRoom, owner: { id: 'gm-1', displayName: 'GM', email: 'gm@x' } }),
    });
    const service = new RoomService(repo);

    await expect(service.update('r1', 'other-user', { name: 'Hack' })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 404 when room does not exist', async () => {
    const repo = makeRoomRepo(); // findById default → null
    const service = new RoomService(repo);

    await expect(service.update('missing', 'gm-1', { name: 'X' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Wave 4.1 — RoomService.delete
// ──────────────────────────────────────────────────────────────────────────────

describe('RoomService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteById when owner matches', async () => {
    const existingRoom = makeRoom({ id: 'r1', ownerId: 'gm-1' });
    const deleteById = vi.fn().mockResolvedValue(existingRoom);
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({ ...existingRoom, owner: { id: 'gm-1', displayName: 'GM', email: 'gm@x' } }),
      deleteById,
    });
    const service = new RoomService(repo);

    await service.delete('r1', 'gm-1', null);

    expect(deleteById).toHaveBeenCalledWith('r1');
  });

  it('broadcasts room:deleted BEFORE calling deleteById', async () => {
    const existingRoom = makeRoom({ id: 'r1', ownerId: 'gm-1' });
    const callOrder: string[] = [];
    const deleteById = vi.fn().mockImplementation(() => {
      callOrder.push('deleteById');
      return Promise.resolve(existingRoom);
    });
    const ioEmit = vi.fn().mockImplementation(() => {
      callOrder.push('emit');
      return { emit: ioEmit };
    });
    const ioTo = vi.fn().mockReturnValue({ emit: ioEmit });
    const mockIo = { to: ioTo } as unknown as import('../../src/socketio/types.js').TypedServer;
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({ ...existingRoom, owner: { id: 'gm-1', displayName: 'GM', email: 'gm@x' } }),
      deleteById,
    });
    const service = new RoomService(repo);

    await service.delete('r1', 'gm-1', mockIo);

    expect(callOrder).toEqual(['emit', 'deleteById']);
    expect(ioTo).toHaveBeenCalledWith('r1');
    expect(ioEmit).toHaveBeenCalledWith('room:deleted', { roomId: 'r1', reason: 'deleted_by_owner' });
  });

  it('throws 403 when requester is not owner', async () => {
    const existingRoom = makeRoom({ id: 'r1', ownerId: 'gm-1' });
    const repo = makeRoomRepo({
      findById: vi.fn().mockResolvedValue({ ...existingRoom, owner: { id: 'gm-1', displayName: 'GM', email: 'gm@x' } }),
    });
    const service = new RoomService(repo);

    await expect(service.delete('r1', 'not-owner', null)).rejects.toMatchObject({ status: 403 });
  });

  it('throws 404 when room not found', async () => {
    const repo = makeRoomRepo(); // findById → null
    const service = new RoomService(repo);

    await expect(service.delete('missing', 'gm-1', null)).rejects.toMatchObject({ status: 404 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Wave 4.3 — RoomService.create with room limit
// ──────────────────────────────────────────────────────────────────────────────

describe('RoomService.create — room limit (Wave 4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['ROOM_LIMIT_PER_USER'];
  });

  it('allows creation when count < limit', async () => {
    const repo = makeRoomRepo({
      countByOwner: vi.fn().mockResolvedValue(5),
    });
    const service = new RoomService(repo);
    process.env['ROOM_LIMIT_PER_USER'] = '20';

    const room = await service.create('owner-1', 'Room 6');

    expect(room.name).toBe('Room 6');
  });

  it('throws 403 ROOM_LIMIT_REACHED when count >= limit', async () => {
    const repo = makeRoomRepo({
      countByOwner: vi.fn().mockResolvedValue(20),
    });
    const service = new RoomService(repo);
    process.env['ROOM_LIMIT_PER_USER'] = '20';

    await expect(service.create('owner-1', 'Room 21')).rejects.toMatchObject({
      status: 403,
      message: 'ROOM_LIMIT_REACHED',
    });
  });

  it('uses default limit of 20 when env var not set', async () => {
    const repo = makeRoomRepo({
      countByOwner: vi.fn().mockResolvedValue(20),
    });
    const service = new RoomService(repo);

    await expect(service.create('owner-1', 'Over limit')).rejects.toMatchObject({
      status: 403,
      message: 'ROOM_LIMIT_REACHED',
    });
  });
});

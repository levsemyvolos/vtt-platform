import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomService } from '../../src/services/RoomService.js';
import type { RoomRepository, RoomWithOwner } from '../../src/repositories/RoomRepository.js';
import type { Room } from '@prisma/client';

function makeRoomRepo(overrides: Partial<RoomRepository> = {}): RoomRepository {
  const capturedData: Partial<Room>[] = [];
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByOwnerId: vi.fn().mockResolvedValue([]),
    findByPlayerInviteToken: vi.fn().mockResolvedValue(null),
    findByObserverInviteToken: vi.fn().mockResolvedValue(null),
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

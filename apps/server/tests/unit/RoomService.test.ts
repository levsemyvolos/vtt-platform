import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomService } from '../../src/services/RoomService.js';
import type { RoomRepository } from '../../src/repositories/RoomRepository.js';
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

/**
 * Socket.IO RBAC Integration Tests
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { RoomAccessService } from '../../src/services/RoomAccessService.js';
import { RoomRepository } from '../../src/repositories/RoomRepository.js';
import type { Role } from '@vtt/shared';

const JWT_SECRET = process.env['JWT_SECRET'] as string;
const ROOM_ID = 'room-uuid-001';
const GM_USER_ID = 'gm-001';
const PLAYER_USER_ID = 'player-001';

function makeRoomRepo(): RoomRepository {
  return {
    getRoleInRoom: async (roomId: string, userId: string, jwtRole: Role, boundRoomId?: string) => {
      if (roomId !== ROOM_ID) return null;
      if (userId === GM_USER_ID) return 'GM';
      if (userId === PLAYER_USER_ID) return 'Player';
      return null;
    },
    findById: async () => ({
      id: ROOM_ID,
      ownerId: GM_USER_ID,
      name: 'Test',
      gameSystem: 'D&D 5e',
      status: 'active',
      inviteTokenPlayer: 'pt',
      inviteTokenObserver: 'ot',
      createdAt: new Date(),
      lastActiveAt: new Date(),
    } as any),
  } as unknown as RoomRepository;
}

describe('Socket.IO RBAC', () => {
  it('GM has access to room', async () => {
    const repo = makeRoomRepo();
    const service = new RoomAccessService(repo);
    const result = await service.resolve({
      roomId: ROOM_ID,
      userId: GM_USER_ID,
      jwtRole: 'Player',
    });
    expect(result?.role).toBe('GM');
  });

  it('Player has access to room', async () => {
    const repo = makeRoomRepo();
    const service = new RoomAccessService(repo);
    const result = await service.resolve({
      roomId: ROOM_ID,
      userId: PLAYER_USER_ID,
      jwtRole: 'Player',
    });
    expect(result?.role).toBe('Player');
  });

  it('Stranger has no access', async () => {
    const repo = makeRoomRepo();
    const service = new RoomAccessService(repo);
    const result = await service.resolve({
      roomId: ROOM_ID,
      userId: 'stranger-999',
      jwtRole: 'Player',
    });
    expect(result).toBeNull();
  });
});

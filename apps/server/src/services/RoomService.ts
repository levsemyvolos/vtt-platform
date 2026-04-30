import { randomBytes, randomUUID } from 'crypto';
import type { Room } from '@prisma/client';
import { RoomRepository, type RoomWithOwner } from '../repositories/RoomRepository.js';
import { HttpError } from '../lib/errors.js';

export class RoomService {
  constructor(private readonly rooms: RoomRepository) {}

  /**
   * Creates room with unique invite tokens for Player and Observer roles.
   * @param ownerId GM user UUID
   * @param name room display name (≤ 128 chars)
   * @param gameSystem ruleset label, e.g. "D&D 5e" (≤ 64 chars)
   * @returns created Room
   */
  async create(ownerId: string, name: string, gameSystem = 'D&D 5e'): Promise<Room> {
    return this.rooms.create({
      id: randomUUID(),
      owner: { connect: { id: ownerId } },
      name,
      gameSystem,
      inviteTokenPlayer: randomBytes(32).toString('hex').slice(0, 64),
      inviteTokenObserver: randomBytes(32).toString('hex').slice(0, 64),
    });
  }

  /**
   * @param ownerId GM user UUID
   * @returns all rooms owned by that user
   */
  async listByOwner(ownerId: string): Promise<Room[]> {
    return this.rooms.findByOwnerId(ownerId);
  }

  /**
   * @param roomId Room UUID
   * @returns Room with owner relation
   * @throws HttpError 404 if not found
   */
  async getById(roomId: string): Promise<RoomWithOwner> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    return room;
  }

  /**
   * Returns invite tokens. Requester must be room owner.
   * @param roomId Room UUID
   * @param viewerId requester UUID
   * @returns { playerToken, observerToken }
   * @throws HttpError 404 if room not found, 403 if not owner
   */
  async getInviteTokens(
    roomId: string,
    viewerId: string,
  ): Promise<{ playerToken: string; observerToken: string }> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    if (room.ownerId !== viewerId) {
      throw new HttpError(403, 'Only room owner can access invite tokens');
    }
    return {
      playerToken: room.inviteTokenPlayer,
      observerToken: room.inviteTokenObserver,
    };
  }
}

import { randomBytes, randomUUID } from 'crypto';
import type { Room, PrismaClient } from '@prisma/client';
import type { RoomMemberDTO } from '@vtt/shared';
import { RoomRepository, type RoomWithOwner } from '../repositories/RoomRepository.js';
import { HttpError } from '../lib/errors.js';

export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly db?: PrismaClient,
  ) {}

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
   * Returns rooms for a user filtered by their role relationship.
   * 'all' (default) returns both owned and invited rooms.
   */
  async listByUserAndRole(
    userId: string,
    filter: 'owned' | 'invited' | 'all' = 'all',
  ): Promise<Room[]> {
    return this.rooms.findByUserAndRole(userId, filter);
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

  /**
   * Validates a player invite token and returns the target Room.
   * Persistent membership tracking is deferred (R-Persistent-Membership);
   * this method only resolves token → Room.
   * @param playerToken raw player invite token
   * @returns Room
   * @throws HttpError 404 if token does not match any room
   */
  async joinByInvite(playerToken: string): Promise<Room> {
    const room = await this.rooms.findByPlayerInviteToken(playerToken);
    if (!room) throw new HttpError(404, 'Invalid invite token');
    return room;
  }

  /**
   * Validates an observer invite token and returns the target Room.
   * The route handler is responsible for creating the anonymous user and
   * issuing JWT tokens — this service stays focused on room concerns.
   * @param observerToken raw observer invite token
   * @returns Room
   * @throws HttpError 404 if token does not match any room
   */
  async joinAsObserver(observerToken: string): Promise<Room> {
    const room = await this.rooms.findByObserverInviteToken(observerToken);
    if (!room) throw new HttpError(404, 'Invalid invite token');
    return room;
  }

  /**
   * γ-variant membership snapshot for RoomDTO.members projection.
   *
   *   gm        = room.owner (always present)
   *   players   = distinct Character.ownerId in this room (joined with User)
   *   observers = [] (no persistent observer tracking yet)
   *
   * Real-time presence (who is currently connected via socket.io) is layered
   * on top of this REST snapshot in the session view.
   *
   * @param roomId Room UUID
   * @returns flat list of RoomMemberDTO (GM + players)
   * @throws HttpError 404 if room not found, 500 if PrismaClient was not injected
   */
  async getMembersProjection(roomId: string): Promise<RoomMemberDTO[]> {
    if (!this.db) {
      throw new HttpError(500, 'RoomService.getMembersProjection requires PrismaClient');
    }
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    const characters = await this.db.character.findMany({
      where: { roomId },
      distinct: ['ownerId'],
      include: { owner: true },
    });
    const members: RoomMemberDTO[] = [
      {
        userId: room.owner.id,
        name: room.owner.displayName,
        role: 'GM',
      },
    ];
    for (const c of characters) {
      if (c.owner.id === room.owner.id) continue; // GM owning a character — skip duplicate
      members.push({
        userId: c.owner.id,
        name: c.owner.displayName,
        role: 'Player',
        characterId: c.id,
      });
    }
    return members;
  }
}

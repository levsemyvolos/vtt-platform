import { randomBytes, randomUUID } from 'crypto';
import type { Room, PrismaClient } from '@prisma/client';
import type { RoomMemberDTO } from '@vtt/shared';
import { RoomRepository, type RoomWithOwner } from '../repositories/RoomRepository.js';
import { HttpError } from '../lib/errors.js';
import type { TypedServer } from '../socketio/types.js';
import type { RoomUpdateInput } from '../schemas/room.schema.js';
import type { Prisma } from '@prisma/client';

export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly db?: PrismaClient,
  ) {}

  /**
   * Creates room with unique invite tokens for Player and Observer roles.
   * Enforces ROOM_LIMIT_PER_USER (default 20) before creating.
   * @param ownerId GM user UUID
   * @param name room display name (≤ 128 chars)
   * @param gameSystem ruleset label, e.g. "D&D 5e" (≤ 64 chars)
   * @returns created Room
   * @throws HttpError 403 ROOM_LIMIT_REACHED if limit exceeded
   */
  async create(ownerId: string, name: string, gameSystem = 'D&D 5e'): Promise<Room> {
    const ROOM_LIMIT = parseInt(process.env.ROOM_LIMIT_PER_USER ?? '20', 10);
    const count = await this.rooms.countByOwner(ownerId);
    if (count >= ROOM_LIMIT) {
      throw new HttpError(403, 'ROOM_LIMIT_REACHED');
    }
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
   * Updates a room's name and/or gameSystem. Only the room owner can update.
   * @param roomId Room UUID
   * @param requesterId requester UUID (must be owner)
   * @param dto partial update data
   * @returns updated Room
   * @throws HttpError 404 if not found, 403 if not owner
   */
  async update(roomId: string, requesterId: string, dto: RoomUpdateInput): Promise<Room> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    if (room.ownerId !== requesterId) throw new HttpError(403, 'Only room owner can edit this room');
    const updateData: Prisma.RoomUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.gameSystem !== undefined) updateData.gameSystem = dto.gameSystem;
    return this.rooms.updateById(roomId, updateData);
  }

  /**
   * Deletes a room. Only the room owner can delete.
   * Broadcasts `room:deleted` to all subscribers BEFORE deletion so clients
   * can redirect before the room disappears from the DB (cascade is in Prisma schema).
   * @param roomId Room UUID
   * @param requesterId requester UUID (must be owner)
   * @param io optional socket.io server for broadcasting
   * @throws HttpError 404 if not found, 403 if not owner
   */
  async delete(roomId: string, requesterId: string, io?: TypedServer | null): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    if (room.ownerId !== requesterId) throw new HttpError(403, 'Only room owner can delete this room');

    // Broadcast BEFORE deletion so clients receive the event while they are still
    // in the socket.io room channel.
    if (io) {
      io.to(roomId).emit('room:deleted', { roomId, reason: 'deleted_by_owner' });
    }

    await this.rooms.deleteById(roomId);
  }

  /**
   * Bumps lastActiveAt to now for a room. Used to track "last session" time.
   * @param roomId Room UUID
   */
  async touchActivity(roomId: string): Promise<void> {
    await this.rooms.updateById(roomId, { lastActiveAt: new Date() } as Prisma.RoomUpdateInput);
  }

  /**
   * Starts a session: sets Room.status = 'active', bumps lastActiveAt,
   * and emits `room:started` to all subscribers in the room channel.
   * Only the room owner (GM) can start a session.
   * @param roomId Room UUID
   * @param requesterId requester UUID (must be owner)
   * @param io optional socket.io server for broadcasting
   * @throws HttpError 404 if not found, 403 if not owner
   */
  async startSession(
    roomId: string,
    requesterId: string,
    io?: TypedServer | null,
  ): Promise<Room> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    if (room.ownerId !== requesterId) throw new HttpError(403, 'Only room owner can start a session');
    const updated = await this.rooms.updateById(roomId, {
      status: 'active',
      lastActiveAt: new Date(),
    } as Prisma.RoomUpdateInput);
    if (io) {
      io.to(roomId).emit('room:started', { roomId });
    }
    return updated;
  }

  /**
   * @param ownerId GM user UUID
   * @returns all rooms owned by that user
   */
  async listByOwner(ownerId: string): Promise<Room[]> {
    return this.rooms.findByOwnerId(ownerId);
  }

  /**
   * Returns rooms for a user filtered by their role relationship, with optional sorting.
   * 'all' (default) returns both owned and invited rooms.
   * Default sort is lastActive desc (most recently used first).
   */
  async listByUserAndRole(
    userId: string,
    filter: 'owned' | 'invited' | 'all' = 'all',
    sort: 'lastActive' | 'created' | 'name' = 'lastActive',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<Room[]> {
    return this.rooms.findByUserAndRole(userId, filter, sort, order);
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
   * Validates a player invite token, upserts a RoomMember record, and returns
   * the target Room. Implements R-Persistent-Membership.
   * @param playerToken raw player invite token
   * @param userId the authenticated user joining
   * @returns Room
   * @throws HttpError 404 if token does not match any room
   */
  async joinByInvite(playerToken: string, userId?: string): Promise<Room> {
    const room = await this.rooms.findByPlayerInviteToken(playerToken);
    if (!room) throw new HttpError(404, 'Invalid invite token');

    // Persist membership so the lobby roster and "invited" tab work after F5.
    if (userId && this.db) {
      // Skip if the user is the room owner (they are already the GM).
      if (room.ownerId !== userId) {
        await this.db.roomMember.upsert({
          where: { roomId_userId: { roomId: room.id, userId } },
          create: { roomId: room.id, userId, role: 'Player' },
          update: { role: 'Player' },
        });
      }
    }

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

    const [characters, roomMembers] = await Promise.all([
      this.db.character.findMany({
        where: { roomId },
        distinct: ['ownerId'],
        include: { owner: true },
      }),
      this.db.roomMember.findMany({
        where: { roomId },
        include: { user: true },
      }),
    ]);

    const members: RoomMemberDTO[] = [
      { userId: room.owner.id, name: room.owner.displayName, role: 'GM' },
    ];
    const charMap = new Map(characters.map((c) => [c.ownerId, c.id]));
    const playerIds = new Set<string>();

    const addPlayer = (userId: string, name: string) => {
      if (userId === room.owner.id || playerIds.has(userId)) return;
      playerIds.add(userId);
      const cid = charMap.get(userId);
      members.push({ userId, name, role: 'Player', ...(cid !== undefined ? { characterId: cid } : {}) });
    };

    characters.forEach((c) => addPlayer(c.ownerId, c.owner.displayName));
    roomMembers.forEach((rm) => addPlayer(rm.userId, rm.user.displayName));

    return members;
  }
}

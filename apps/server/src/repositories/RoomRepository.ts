import { PrismaClient, Prisma, Room } from '@prisma/client';
import type { Role } from '@vtt/shared';

export type RoomWithOwner = Prisma.RoomGetPayload<{ include: { owner: true } }>;

export class RoomRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * @param id Room UUID
   * @returns Room with owner relation or null
   */
  findById(id: string): Promise<RoomWithOwner | null> {
    return this.db.room.findUnique({ where: { id }, include: { owner: true } });
  }

  /**
   * @param ownerId GM user UUID
   * @returns all rooms owned by the user
   */
  findByOwnerId(ownerId: string): Promise<Room[]> {
    return this.db.room.findMany({ where: { ownerId } });
  }

  /**
   * @param token player invite token
   * @returns Room or null
   */
  findByPlayerInviteToken(token: string): Promise<Room | null> {
    return this.db.room.findUnique({ where: { inviteTokenPlayer: token } });
  }

  /**
   * @param token observer invite token
   * @returns Room or null
   */
  findByObserverInviteToken(token: string): Promise<Room | null> {
    return this.db.room.findUnique({ where: { inviteTokenObserver: token } });
  }

  /**
   * @param data Prisma.RoomCreateInput
   * @returns created Room
   */
  create(data: Prisma.RoomCreateInput): Promise<Room> {
    return this.db.room.create({ data });
  }

  /**
   * @param id Room UUID
   * @param data partial update (name, gameSystem, lastActiveAt)
   * @returns updated Room
   */
  updateById(id: string, data: Prisma.RoomUpdateInput): Promise<Room> {
    return this.db.room.update({ where: { id }, data });
  }

  /**
   * Deletes a room by ID. Cascade is enforced by Prisma schema (onDelete: Cascade).
   * @param id Room UUID
   */
  deleteById(id: string): Promise<Room> {
    return this.db.room.delete({ where: { id } });
  }

  /**
   * @param ownerId GM user UUID
   * @returns count of rooms owned by that user
   */
  countByOwner(ownerId: string): Promise<number> {
    return this.db.room.count({ where: { ownerId } });
  }

  /**
   * Returns rooms filtered by the user's relationship to them, with optional sorting.
   *
   * - 'owned'   → rooms where user is the owner (GM)
   * - 'invited' → rooms where user has a RoomMember record OR a character
   *               but is NOT the owner (Player)
   * - 'all'     → union of both
   *
   * @param sort  field to sort by (default: lastActiveAt)
   * @param order sort direction (default: desc)
   *
   * R-Persistent-Membership: now uses RoomMember table as primary source;
   * Character.ownerId kept as a secondary source for backwards compat.
   */
  findByUserAndRole(
    userId: string,
    filter: 'owned' | 'invited' | 'all',
    sort: 'lastActive' | 'created' | 'name' = 'lastActive',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<Room[]> {
    const orderBy = this._buildOrderBy(sort, order);
    if (filter === 'owned') {
      return this.db.room.findMany({ where: { ownerId: userId }, orderBy });
    }
    if (filter === 'invited') {
      return this.db.room.findMany({
        where: {
          NOT: { ownerId: userId },
          OR: [
            { members: { some: { userId } } },
            { characters: { some: { ownerId: userId } } },
          ],
        },
        orderBy,
      });
    }
    return this.db.room.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
          { characters: { some: { ownerId: userId } } },
        ],
      },
      orderBy,
    });
  }

  private _buildOrderBy(
    sort: 'lastActive' | 'created' | 'name',
    order: 'asc' | 'desc',
  ): Prisma.RoomOrderByWithRelationInput {
    if (sort === 'created') return { createdAt: order };
    if (sort === 'name') return { name: order };
    return { lastActiveAt: order };
  }

  /**
   * Resolves the effective role of `userId` inside `roomId`.
   *
   * MVP rules (no dedicated RoomMember table yet):
   *   - Room owner       → 'GM'.
   *   - Anyone else      → fall through to `fallbackJwtRole` (the role baked
   *     into the user's access token at invite-redemption time).
   *   - Room not found   → null.
   *
   * Persisted membership tracking (Player vs Observer attached to a room) is
   * planned for a later iteration; for Чат 7.1 the JWT-bound role is the
   * single source of truth for non-owners.
   *
   * @param roomId Room UUID
   * @param userId User UUID
   * @param fallbackJwtRole role from req.user.role for non-owners
   */
  async getRoleInRoom(
    roomId: string,
    userId: string,
    fallbackJwtRole: Role,
  ): Promise<Role | null> {
    const room = await this.db.room.findUnique({
      where: { id: roomId },
      select: { ownerId: true },
    });
    if (!room) return null;
    if (room.ownerId === userId) return 'GM';
    return fallbackJwtRole;
  }
}

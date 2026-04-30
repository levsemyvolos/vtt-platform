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

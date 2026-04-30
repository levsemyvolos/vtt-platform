import { PrismaClient, Prisma, Room } from '@prisma/client';

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
}

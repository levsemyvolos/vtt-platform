import type { PrismaClient, Prisma } from '@prisma/client';

export type HandoutWithRecipientsAndAsset = Prisma.HandoutGetPayload<{
  include: { recipients: true; asset: true };
}>;

/**
 * Persistence for Ф7.2 — handouts (роздаткові матеріали).
 * All read paths return rows with `recipients` and `asset` eagerly loaded so
 * HandoutService can project DTOs without extra round-trips.
 */
export class HandoutRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<HandoutWithRecipientsAndAsset | null> {
    return this.db.handout.findUnique({
      where: { id },
      include: { recipients: true, asset: true },
    });
  }

  listByRoom(roomId: string): Promise<HandoutWithRecipientsAndAsset[]> {
    return this.db.handout.findMany({
      where: { roomId },
      include: { recipients: true, asset: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.HandoutUncheckedCreateInput): Promise<HandoutWithRecipientsAndAsset> {
    return this.db.handout.create({
      data,
      include: { recipients: true, asset: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.handout.delete({ where: { id } });
  }

  /**
   * Bulk-grants the handout to a list of users. `skipDuplicates` makes the
   * call idempotent: re-granting an existing recipient is a no-op.
   */
  async grantTo(handoutId: string, userIds: string[]): Promise<HandoutWithRecipientsAndAsset> {
    await this.db.$transaction(async (tx) => {
      if (userIds.length === 0) return;
      await tx.handoutRecipient.createMany({
        data: userIds.map((userId) => ({ handoutId, userId })),
        skipDuplicates: true,
      });
    });
    const fresh = await this.findById(handoutId);
    if (!fresh) {
      throw new Error(`Handout ${handoutId} vanished after grantTo`);
    }
    return fresh;
  }

  async revokeFrom(handoutId: string, userId: string): Promise<HandoutWithRecipientsAndAsset> {
    await this.db.handoutRecipient.deleteMany({ where: { handoutId, userId } });
    const fresh = await this.findById(handoutId);
    if (!fresh) {
      throw new Error(`Handout ${handoutId} vanished after revokeFrom`);
    }
    return fresh;
  }

  /**
   * Returns handouts in `roomId` that have been granted to `userId`.
   * Used by HandoutService.listForViewer for Player viewers.
   */
  listGrantedToUser(
    roomId: string,
    userId: string,
  ): Promise<HandoutWithRecipientsAndAsset[]> {
    return this.db.handout.findMany({
      where: {
        roomId,
        recipients: { some: { userId } },
      },
      include: { recipients: true, asset: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

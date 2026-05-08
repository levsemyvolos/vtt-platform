import type { PrismaClient, JournalEntry, JournalRecipient, Asset, Prisma } from '@prisma/client';

export interface JournalEntryWithRelations extends JournalEntry {
  recipients: JournalRecipient[];
  asset: Asset | null;
}

/**
 * Persistence for Ф10 — journal entries (unified Notes ⊕ Handouts).
 * RBAC is performed in JournalService. This class is a thin data-access layer.
 */
export class JournalRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<JournalEntryWithRelations | null> {
    return this.db.journalEntry.findUnique({
      where: { id },
      include: { recipients: true, asset: true },
    });
  }

  listByRoom(roomId: string): Promise<JournalEntryWithRelations[]> {
    return this.db.journalEntry.findMany({
      where: { roomId },
      include: { recipients: true, asset: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.JournalEntryUncheckedCreateInput): Promise<JournalEntryWithRelations> {
    return this.db.journalEntry.create({
      data,
      include: { recipients: true, asset: true },
    });
  }

  update(id: string, data: Prisma.JournalEntryUncheckedUpdateInput): Promise<JournalEntryWithRelations> {
    return this.db.journalEntry.update({
      where: { id },
      data,
      include: { recipients: true, asset: true },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.journalEntry.delete({ where: { id } });
  }

  /** Atomic replace: delete all current recipients, then insert new list. */
  async setRecipients(entryId: string, userIds: string[]): Promise<void> {
    await this.db.$transaction([
      this.db.journalRecipient.deleteMany({ where: { entryId } }),
      ...(userIds.length > 0
        ? [
            this.db.journalRecipient.createMany({
              data: userIds.map((userId) => ({ entryId, userId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }
}

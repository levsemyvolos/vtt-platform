import type { PrismaClient, Prisma, InitiativeEntry } from '@prisma/client';

/**
 * Persistence for the initiative tracker (Ф7.3).
 * Order semantics: rows are sorted by (initiative DESC, orderIndex ASC).
 * `orderIndex` resolves ties and is rewritten by `updateOrder` on drag-drop.
 */
export class InitiativeRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<InitiativeEntry | null> {
    return this.db.initiativeEntry.findUnique({ where: { id } });
  }

  listByScene(sceneId: string): Promise<InitiativeEntry[]> {
    return this.db.initiativeEntry.findMany({
      where: { sceneId },
      orderBy: [{ initiative: 'desc' }, { orderIndex: 'asc' }],
    });
  }

  create(data: Prisma.InitiativeEntryCreateInput): Promise<InitiativeEntry> {
    return this.db.initiativeEntry.create({ data });
  }

  async delete(id: string): Promise<void> {
    await this.db.initiativeEntry.delete({ where: { id } });
  }

  count(sceneId: string): Promise<number> {
    return this.db.initiativeEntry.count({ where: { sceneId } });
  }

  /**
   * Atomically rewrites `orderIndex` for every entry in `orderedIds` to its
   * 0-based position. Entries in the scene that are absent from `orderedIds`
   * are left untouched (caller should pass a complete list).
   *
   * Wrapped in a transaction so partial reorderings are not observable.
   */
  async updateOrder(sceneId: string, orderedIds: string[]): Promise<void> {
    await this.db.$transaction(
      orderedIds.map((id, idx) =>
        this.db.initiativeEntry.updateMany({
          where: { id, sceneId },
          data: { orderIndex: idx },
        }),
      ),
    );
  }

  /**
   * Sets `entryId` as current and clears the flag on every other entry of the
   * same scene — atomic, so the invariant "at most one current per scene"
   * holds across writers.
   */
  async setCurrent(sceneId: string, entryId: string): Promise<void> {
    await this.db.$transaction([
      this.db.initiativeEntry.updateMany({
        where: { sceneId, NOT: { id: entryId } },
        data: { isCurrent: false },
      }),
      this.db.initiativeEntry.updateMany({
        where: { sceneId, id: entryId },
        data: { isCurrent: true },
      }),
    ]);
  }

  updateEntry(id: string, data: { name?: string; initiative?: number }): Promise<InitiativeEntry> {
    return this.db.initiativeEntry.update({ where: { id }, data });
  }

  async clearCurrent(sceneId: string): Promise<void> {
    await this.db.initiativeEntry.updateMany({
      where: { sceneId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  /**
   * @returns `orderIndex` of the current entry or null if none is marked.
   */
  async getCurrentIndex(sceneId: string): Promise<number | null> {
    const row = await this.db.initiativeEntry.findFirst({
      where: { sceneId, isCurrent: true },
      select: { orderIndex: true },
    });
    return row?.orderIndex ?? null;
  }
}

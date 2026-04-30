import type { PrismaClient, Prisma, InitiativeEntry } from '@prisma/client';

export class InitiativeRepository {
  constructor(private readonly db: PrismaClient) {}

  listByScene(sceneId: string): Promise<InitiativeEntry[]> {
    return this.db.initiativeEntry.findMany({
      where: { sceneId },
      orderBy: [{ initiative: 'desc' }, { orderIndex: 'asc' }],
    });
  }

  create(data: Prisma.InitiativeEntryCreateInput): Promise<InitiativeEntry> {
    return this.db.initiativeEntry.create({ data });
  }
}

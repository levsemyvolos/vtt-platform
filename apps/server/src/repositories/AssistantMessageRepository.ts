import type { PrismaClient, AssistantMessage, Prisma } from '@prisma/client';

const HISTORY_LIMIT = 200;

export class AssistantMessageRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.AssistantMessageUncheckedCreateInput): Promise<AssistantMessage> {
    return this.db.assistantMessage.create({ data });
  }

  /**
   * Returns last N messages for a room, sorted oldest-first.
   */
  async findByRoom(roomId: string): Promise<AssistantMessage[]> {
    const rows = await this.db.assistantMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    // Reverse so the client receives oldest-first order.
    return rows.reverse();
  }
}

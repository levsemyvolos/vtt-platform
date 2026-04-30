import type { PrismaClient, Prisma, ChatMessage } from '@prisma/client';

export class ChatMessageRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.ChatMessageCreateInput): Promise<ChatMessage> {
    return this.db.chatMessage.create({ data });
  }

  /**
   * Returns the N most recent messages for a room, ordered chronologically (asc).
   * Used by SessionResyncService (algorithm A3).
   * @param roomId Room UUID
   * @param limit max rows (default 200 per НФВ 3.2 budget)
   */
  async listRecent(roomId: string, limit = 200): Promise<ChatMessage[]> {
    const desc = await this.db.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return desc.reverse();
  }
}

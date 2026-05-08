import type { PrismaClient, AssistantMessage, Prisma } from '@prisma/client';

const HISTORY_LIMIT = 200;

export class AssistantMessageRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.AssistantMessageUncheckedCreateInput): Promise<AssistantMessage> {
    return this.db.assistantMessage.create({ data });
  }

  /**
   * Last N messages for a room across ALL conversations, oldest-first.
   * Kept for the legacy `GET /api/ai/messages?roomId=` route until Session 3.1
   * deprecates it in favour of `findByConversation`.
   */
  async findByRoom(roomId: string): Promise<AssistantMessage[]> {
    const rows = await this.db.assistantMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return rows.reverse();
  }

  /** All messages of a single conversation, oldest-first. */
  findByConversation(conversationId: string): Promise<AssistantMessage[]> {
    return this.db.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Deletes all messages with `createdAt > marker` in the given conversation.
   * Used by Session 4.3 (edit-and-resend) to truncate after an edited message.
   */
  deleteAfter(conversationId: string, createdAt: Date): Promise<{ count: number }> {
    return this.db.assistantMessage.deleteMany({
      where: { conversationId, createdAt: { gt: createdAt } },
    });
  }

  /** Updates the content of a single message. Used by edit-and-resend (Session 4.3). */
  update(id: string, content: string): Promise<AssistantMessage> {
    return this.db.assistantMessage.update({ where: { id }, data: { content } });
  }

  /** Find a single message by id. Returns null if missing. */
  findById(id: string): Promise<AssistantMessage | null> {
    return this.db.assistantMessage.findUnique({ where: { id } });
  }

  /**
   * Counts user-role messages saved in a room since a cutoff time. Proxy for
   * "AI text requests in last 24h" (Session 6.3.B).
   */
  countUserMessagesByRoomSince(roomId: string, since: Date): Promise<number> {
    return this.db.assistantMessage.count({
      where: { roomId, role: 'user', createdAt: { gt: since } },
    });
  }
}

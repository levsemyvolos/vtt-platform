import type { PrismaClient, Prisma, ChatMessage } from '@prisma/client';
import type { Role } from '@vtt/shared';

export interface ListRecentOptions {
  /** Viewer's per-room role. When 'Player', `observer`-channel rows are filtered out
   *  so that Player chat history never leaks the observers' side-channel.
   *  GM and Observer see all rows (`observer` channel + `public`).
   *  Undefined ⇒ no role-based filtering (legacy call sites, AI context builder). */
  viewerRole?: Role;
}

export class ChatMessageRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.ChatMessageCreateInput): Promise<ChatMessage> {
    return this.db.chatMessage.create({ data });
  }

  /**
   * Returns the N most recent messages for a room, ordered chronologically (asc).
   * Used by SessionResyncService (algorithm A3).
   *
   * @param roomId Room UUID
   * @param limit max rows (default 200 per НФВ 3.2 budget)
   * @param options viewer-aware filter (drops `observer`-channel rows for Players)
   */
  async listRecent(
    roomId: string,
    limit = 200,
    options: ListRecentOptions = {},
  ): Promise<ChatMessage[]> {
    const where: Prisma.ChatMessageWhereInput = { roomId };
    if (options.viewerRole === 'Player') {
      where.channel = 'public';
    }
    const desc = await this.db.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return desc.reverse();
  }
}

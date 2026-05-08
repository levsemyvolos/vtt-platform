import type {
  PrismaClient,
  AssistantImageConversation,
  AssistantImageTurn,
  Prisma,
} from '@prisma/client';

export class AssistantImageConversationRepository {
  constructor(private readonly db: PrismaClient) {}

  // ---- conversation ----

  create(data: Prisma.AssistantImageConversationUncheckedCreateInput): Promise<AssistantImageConversation> {
    return this.db.assistantImageConversation.create({ data });
  }

  findById(id: string): Promise<AssistantImageConversation | null> {
    return this.db.assistantImageConversation.findUnique({ where: { id } });
  }

  findByRoomAndOwner(roomId: string, ownerId: string): Promise<AssistantImageConversation[]> {
    return this.db.assistantImageConversation.findMany({
      where: { roomId, ownerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  rename(id: string, title: string): Promise<AssistantImageConversation> {
    return this.db.assistantImageConversation.update({ where: { id }, data: { title } });
  }

  delete(id: string): Promise<AssistantImageConversation> {
    return this.db.assistantImageConversation.delete({ where: { id } });
  }

  touch(id: string): Promise<AssistantImageConversation> {
    return this.db.assistantImageConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  // ---- turns ----

  listTurns(conversationId: string): Promise<AssistantImageTurn[]> {
    return this.db.assistantImageTurn.findMany({
      where: { conversationId },
      orderBy: { turnIndex: 'asc' },
    });
  }

  appendTurn(data: Prisma.AssistantImageTurnUncheckedCreateInput): Promise<AssistantImageTurn> {
    return this.db.assistantImageTurn.create({ data });
  }

  countTurns(conversationId: string): Promise<number> {
    return this.db.assistantImageTurn.count({ where: { conversationId } });
  }
}

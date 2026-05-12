import type { PrismaClient, AssistantConversation, Prisma } from '@prisma/client';

export class AssistantConversationRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.AssistantConversationUncheckedCreateInput): Promise<AssistantConversation> {
    return this.db.assistantConversation.create({ data });
  }

  findById(id: string): Promise<AssistantConversation | null> {
    return this.db.assistantConversation.findUnique({ where: { id } });
  }

  /** All conversations a user owns inside a room, most-recently-active first. */
  findByRoomAndOwner(roomId: string, ownerId: string): Promise<AssistantConversation[]> {
    return this.db.assistantConversation.findMany({
      where: { roomId, ownerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Latest conversation for (roomId, ownerId, context). Used by the
   * AssistantService.saveMessage bridge (legacy route).
   * to take an explicit conversationId.
   */
  findLatestByRoomOwnerContext(
    roomId: string,
    ownerId: string,
    context: string,
  ): Promise<AssistantConversation | null> {
    return this.db.assistantConversation.findFirst({
      where: { roomId, ownerId, context },
      orderBy: { updatedAt: 'desc' },
    });
  }

  rename(id: string, title: string): Promise<AssistantConversation> {
    return this.db.assistantConversation.update({ where: { id }, data: { title } });
  }

  /**
   * Replaces per-conversation default variables (Phase 2a S3.1).
   * Pass `null` for any field to clear it. Pass `undefined` for any field to leave it.
   * Caller is responsible for owner-RBAC.
   */
  updateDefaults(
    id: string,
    defaults: {
      defaultRuleset?: string | null;
      defaultSetting?: string | null;
      defaultPlayerLevel?: number | null;
      defaultTone?: string | null;
      defaultOutputLanguage?: string | null;
    },
  ): Promise<AssistantConversation> {
    return this.db.assistantConversation.update({
      where: { id },
      data: defaults as Prisma.AssistantConversationUpdateInput,
    });
  }

  delete(id: string): Promise<AssistantConversation> {
    return this.db.assistantConversation.delete({ where: { id } });
  }

  /** Bumps updatedAt to now. Called whenever a new message is appended. */
  touch(id: string): Promise<AssistantConversation> {
    return this.db.assistantConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}

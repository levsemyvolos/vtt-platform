import { randomUUID } from 'crypto';
import type { AIProvider } from '../infrastructure/ai/AIProvider.js';
import type {
  AssistantContext,
  AssistantTextRequest,
  AssistantTextResponse,
  AssistantMessageDTO,
  SaveAssistantMessageRequest,
  AssistantHistoryResponse,
  AssistantConversationDTO,
  CreateAssistantConversationRequest,
  RenameAssistantConversationRequest,
  ListAssistantConversationsResponse,
  AssistantStreamEvent,
  AssistantStreamRequest,
  AIQuotaResponse,
} from '@vtt/shared';
import type { AssistantMessageRepository } from '../repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../repositories/AssistantConversationRepository.js';
import type { SessionContextBuilder } from './SessionContextBuilder.js';
import type { AssetRepository } from '../repositories/AssetRepository.js';

interface AssistantMessageRow {
  role: string;
  content: string;
}

const SYSTEM_PROMPTS: Record<AssistantContext, string> = {
  'npc-description':
    'Ти — досвідчений Game Master D&D 5e. Опиши NPC коротко (3–5 речень): зовнішність, поведінка, мотивація. Уникай реальних бойових статистик.',
  'scene-description':
    'Ти — досвідчений Game Master D&D 5e. Опиши сцену атмосферно (5–8 речень): візуал, звуки, запахи, настрій. Без NPC.',
  'srd-lookup':
    "Ти — D&D 5e SRD reference. Поясни правило (2–4 речення з прикладом). Якщо правило не SRD — скажи 'не входить в SRD'.",
  'free-chat':
    'Ти — асистент Game Master. Допоможи з будь-яким аспектом проведення сесії.',
};

const MAX_HISTORY = 10;

export class AssistantService {
  constructor(
    private readonly provider: AIProvider,
    private readonly msgRepo?: AssistantMessageRepository,
    private readonly convRepo?: AssistantConversationRepository,
    private readonly contextBuilder?: SessionContextBuilder,
    private readonly assetRepo?: AssetRepository,
  ) {}

  /**
   * Persists a single assistant message to DB. Idempotent if called
   * with same content — just creates a new row with new UUID.
   */
  /** Resolve (conversationId, context) for a saveMessage call. */
  private async resolveConversation(
    req: SaveAssistantMessageRequest,
    userId: string,
  ): Promise<{ conversationId: string; context: AssistantContext }> {
    if (req.conversationId) {
      const existing = await this.convRepo!.findById(req.conversationId);
      if (!existing) throw new Error('NOT_FOUND');
      if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
      if (existing.roomId !== req.roomId) throw new Error('FORBIDDEN');
      return {
        conversationId: existing.id,
        context: (req.context ?? existing.context) as AssistantContext,
      };
    }
    const context: AssistantContext = 'free-chat';
    let conv = await this.convRepo!.findLatestByRoomOwnerContext(req.roomId, userId, context);
    if (!conv) {
      conv = await this.convRepo!.create({
        id: randomUUID(),
        roomId: req.roomId,
        ownerId: userId,
        context,
        title: 'Default',
      });
    }
    return { conversationId: conv.id, context };
  }

  async saveMessage(
    req: SaveAssistantMessageRequest,
    userId: string | null,
  ): Promise<AssistantMessageDTO> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    if (userId === null) {
      throw new Error('saveMessage bridge requires non-null userId');
    }

    const { conversationId, context } = await this.resolveConversation(req, userId);

    const msg = await this.msgRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      userId,
      conversationId,
      context,
      role: req.role,
      content: req.content,
    });

    await this.convRepo.touch(conversationId);

    return {
      id: msg.id,
      roomId: msg.roomId,
      userId: msg.userId ?? null,
      role: msg.role as AssistantMessageDTO['role'],
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  private toConversationDTO(conv: { id: string; roomId: string; ownerId: string; context: string; title: string; createdAt: Date; updatedAt: Date }): AssistantConversationDTO {
    return {
      id: conv.id,
      roomId: conv.roomId,
      ownerId: conv.ownerId,
      context: conv.context as AssistantConversationDTO['context'],
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  }

  private defaultTitleFor(context: AssistantContext): string {
    const map: Record<AssistantContext, string> = {
      'npc-description': 'Новий NPC',
      'scene-description': 'Нова сцена',
      'srd-lookup': 'SRD питання',
      'free-chat': 'Розмова',
    };
    return map[context];
  }

  /**
   * Lists all conversations the requesting user owns inside the given room.
   * Owner-scoped: a player never sees another player's threads.
   */
  async listConversations(roomId: string, userId: string): Promise<ListAssistantConversationsResponse> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const rows = await this.convRepo.findByRoomAndOwner(roomId, userId);
    return { conversations: rows.map((r) => this.toConversationDTO(r)) };
  }

  /**
   * Creates a new conversation for (roomId, userId, context).
   * Caller is responsible for verifying the user is a member of the room
   * before invoking this — the service does not consult RoomRepository.
   */
  async createConversation(
    req: CreateAssistantConversationRequest,
    userId: string,
  ): Promise<AssistantConversationDTO> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const title = req.title?.trim().slice(0, 120) || this.defaultTitleFor(req.context);
    const conv = await this.convRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      ownerId: userId,
      context: req.context,
      title,
    });
    return this.toConversationDTO(conv);
  }

  /**
   * Renames a conversation. Throws on non-existent or non-owner.
   */
  async renameConversation(
    conversationId: string,
    req: RenameAssistantConversationRequest,
    userId: string,
  ): Promise<AssistantConversationDTO> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
    const title = req.title.trim().slice(0, 120);
    if (title.length === 0) throw new Error('INVALID_TITLE');
    const updated = await this.convRepo.rename(conversationId, title);
    return this.toConversationDTO(updated);
  }

  /**
   * Deletes a conversation. Cascades to its messages via FK ON DELETE CASCADE.
   * Throws on non-existent or non-owner.
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
    await this.convRepo.delete(conversationId);
  }

  /**
   * Returns all messages of a single conversation, oldest-first.
   * Throws on non-existent or non-owner.
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
  ): Promise<AssistantHistoryResponse> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
    const rows = await this.msgRepo.findByConversation(conversationId);
    return {
      messages: rows.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        userId: m.userId ?? null,
        role: m.role as AssistantMessageDTO['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Returns the markdown context block the server would inject for the given
   * conversation. Owner-scoped. Empty string when the builder is not wired.
   */
  async getContextPreview(conversationId: string, userId: string): Promise<string> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    if (!this.contextBuilder) return '';
    try {
      return await this.contextBuilder.build(conv.roomId, userId);
    } catch {
      return '';
    }
  }

  /**
   * Returns last 200 messages for a room (oldest-first).
   */
  async getHistory(roomId: string): Promise<AssistantHistoryResponse> {
    if (!this.msgRepo) return { messages: [] };
    const rows = await this.msgRepo.findByRoom(roomId);
    return {
      messages: rows.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        userId: m.userId ?? null,
        role: m.role as AssistantMessageDTO['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  private static readonly SRD_SYSTEM_PROMPT =
    "Ти — D&D 5e SRD reference. Користувач (гравець або GM) запитує правило. Відповідай коротко (2–4 речення) " +
    "з прикладом застосування. Цитуй тільки SRD 5.1 — якщо правило не входить у SRD (наприклад, homebrew, " +
    "класи з Tasha's, Xanathar's), скажи 'не входить в SRD' і коротко поясни де його шукати. " +
    "Не вигадуй numbers, AC, DC, damage dice. Якщо не впевнений — скажи 'я не впевнений'.";

  /**
   * Read-only SRD rule lookup (Session 6.1, M10).
   * Available to all room members (GM and players). No DB write, no conversation
   * history, no session-context injection — a single-turn Q&A.
   */
  async lookupSRD(prompt: string): Promise<string> {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) throw new Error('INVALID_CONTENT');
    if (trimmed.length > 1000) throw new Error('INVALID_CONTENT');
    const fullPrompt = `${AssistantService.SRD_SYSTEM_PROMPT}\n\nUser: ${trimmed}`;
    return this.provider.generateText(fullPrompt, { thinkingLevel: 'low' });
  }

  /**
   * Returns AI usage stats for a room — image/audio/LLM counts last-24h + totals.
   * Called by GET /api/ai/quota. Caller is responsible for member-of-room RBAC.
   * Returns zeros for any wing whose repo isn't wired (graceful in tests).
   */
  async getRoomQuota(roomId: string): Promise<AIQuotaResponse> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const zero = Promise.resolve(0);
    const [imgs24, imgsTotal, aud24, audTotal, msgs24] = await Promise.all([
      this.assetRepo ? this.assetRepo.countByRoomAndSourceSince(roomId, 'AI_IMAGE', since) : zero,
      this.assetRepo ? this.assetRepo.countByRoomAndSource(roomId, 'AI_IMAGE') : zero,
      this.assetRepo ? this.assetRepo.countByRoomAndSourceSince(roomId, 'AI_AUDIO', since) : zero,
      this.assetRepo ? this.assetRepo.countByRoomAndSource(roomId, 'AI_AUDIO') : zero,
      this.msgRepo ? this.msgRepo.countUserMessagesByRoomSince(roomId, since) : zero,
    ]);
    return {
      images: { last24h: imgs24, total: imgsTotal },
      audio: { last24h: aud24, total: audTotal },
      llm: { messagesLast24h: msgs24 },
    };
  }

  async generateAssistantText(req: AssistantTextRequest): Promise<AssistantTextResponse> {
    const system = SYSTEM_PROMPTS[req.context];
    const history = (req.conversationHistory ?? []).slice(-MAX_HISTORY);
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    const fullPrompt = [
      system,
      historyText ? `\nConversation history:\n${historyText}` : '',
      `\nUser: ${req.userPrompt}`,
    ]
      .filter(Boolean)
      .join('');
    const content = await this.provider.generateText(fullPrompt, { thinkingLevel: req.thinkingLevel ?? 'low' });
    return { content };
  }

  /**
   * Streams chunks from the provider, accumulates them, then persists the
   * completed assistant message. Returns false if aborted before completion.
   */
  private async streamAndSave(
    fullPrompt: string,
    userMessageId: string,
    conv: { id: string; roomId: string; context: string },
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    emit({ type: 'start', userMessageId });
    let accumulated = '';
    for await (const chunk of this.provider.generateTextStream(fullPrompt, signal, { thinkingLevel: 'low' })) {
      if (signal?.aborted) return false;
      accumulated += chunk;
      emit({ type: 'chunk', delta: chunk });
    }
    if (signal?.aborted) return false;
    const assistantMsg = await this.msgRepo!.create({
      id: randomUUID(),
      roomId: conv.roomId,
      userId,
      conversationId: conv.id,
      context: conv.context,
      role: 'assistant',
      content: accumulated,
    });
    await this.convRepo!.touch(conv.id);
    emit({ type: 'done', assistantMessageId: assistantMsg.id, content: accumulated });
    return true;
  }

  /**
   * Builds the LLM prompt from a conversation context + history + a user-prompt
   * to send. Used by streamAndPersist, regenerateAndStream, editAndStream.
   */
  private buildPrompt(
    context: AssistantContext,
    history: AssistantMessageRow[],
    userPrompt: string,
    sessionContext?: string,
  ): string {
    const system = SYSTEM_PROMPTS[context];
    const ctxBlock = sessionContext && sessionContext.trim().length > 0
      ? `\n\n--- Контекст сесії ---\n${sessionContext}\n--- /Контекст сесії ---\n`
      : '';
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    return [
      system,
      ctxBlock,
      historyText ? `\nConversation history:\n${historyText}` : '',
      `\nUser: ${userPrompt}`,
    ].filter(Boolean).join('');
  }

  private async fetchSessionContext(
    roomId: string,
    userId: string,
    enabled: boolean,
  ): Promise<string> {
    if (!enabled || !this.contextBuilder) return '';
    try {
      return await this.contextBuilder.build(roomId, userId);
    } catch {
      // Builder failure must not break AI generation — degrade silently.
      return '';
    }
  }

  /**
   * Streams an assistant reply via SSE while persisting both messages atomically:
   * the user message is saved before the stream starts (so partial completions
   * leave a record), the assistant message is saved only when the stream finishes
   * normally. On AbortSignal trip — partial assistant content is discarded.
   */
  async streamAndPersist(
    req: AssistantStreamRequest,
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');

    // 1. Verify ownership.
    const conv = await this.convRepo.findById(req.conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    if (conv.roomId !== req.roomId) throw new Error('FORBIDDEN');

    // 2. Persist user message.
    const userMsg = await this.msgRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      userId,
      conversationId: req.conversationId,
      context: req.context,
      role: 'user',
      content: req.userPrompt,
    });

    emit({ type: 'start', userMessageId: userMsg.id });

    // 3. Build prompt from conversation history (excluding the just-saved user message).
    const allMsgs = await this.msgRepo.findByConversation(req.conversationId);
    const history = allMsgs.filter((m) => m.id !== userMsg.id).slice(-10);
    const sessionCtx = await this.fetchSessionContext(
      req.roomId,
      userId,
      req.useSessionContext !== false, // default true when undefined
    );
    const fullPrompt = this.buildPrompt(req.context as AssistantContext, history, req.userPrompt, sessionCtx);

    // 4. Stream + accumulate.
    let accumulated = '';
    for await (const chunk of this.provider.generateTextStream(fullPrompt, signal, { thinkingLevel: req.thinkingLevel ?? 'low' })) {
      if (signal?.aborted) {
        // Client disconnected — stop without saving the partial assistant reply.
        return;
      }
      accumulated += chunk;
      emit({ type: 'chunk', delta: chunk });
    }

    if (signal?.aborted) return;

    // 5. Persist assistant message.
    const assistantMsg = await this.msgRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      userId,
      conversationId: req.conversationId,
      context: req.context,
      role: 'assistant',
      content: accumulated,
    });

    await this.convRepo.touch(req.conversationId);

    emit({ type: 'done', assistantMessageId: assistantMsg.id, content: accumulated });
  }

  /**
   * Regenerates the last assistant reply of a conversation.
   * Drops the last assistant message (if any), then re-streams a fresh reply
   * based on history up through the last user message.
   */
  async regenerateAndStream(
    conversationId: string,
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');

    const conv = await this.convRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');

    const all = await this.msgRepo.findByConversation(conversationId);
    // Find last user message — that's the prompt to re-send.
    let lastUser: { id: string; content: string; createdAt: Date } | null = null;
    for (let i = all.length - 1; i >= 0; i--) {
      const m = all[i];
      if (m && m.role === 'user') {
        lastUser = { id: m.id, content: m.content, createdAt: m.createdAt };
        break;
      }
    }
    if (!lastUser) throw new Error('NO_USER_MESSAGE');

    // Drop everything after the last user message (the previous assistant reply, if any).
    await this.msgRepo.deleteAfter(conversationId, lastUser.createdAt);

    // Build prompt from history strictly BEFORE the last user message.
    const history = all.filter((m) => m.createdAt < lastUser!.createdAt).slice(-10);
    const sessionCtx = await this.fetchSessionContext(conv.roomId, userId, true);
    const fullPrompt = this.buildPrompt(conv.context as AssistantContext, history, lastUser.content, sessionCtx);

    await this.streamAndSave(fullPrompt, lastUser.id, conv, userId, emit, signal);
  }

  /**
   * Edit-and-resend: replace the content of a user-role message, drop everything
   * created strictly after it (replies + later turns), then stream a fresh
   * assistant reply.
   */
  async editAndStream(
    conversationId: string,
    messageId: string,
    newContent: string,
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');

    const conv = await this.convRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');

    const target = await this.msgRepo.findById(messageId);
    if (!target) throw new Error('NOT_FOUND');
    if (target.conversationId !== conversationId) throw new Error('FORBIDDEN');
    if (target.role !== 'user') throw new Error('INVALID_TARGET');

    const trimmed = newContent.trim();
    if (trimmed.length === 0) throw new Error('INVALID_CONTENT');

    // 1. Update the user message in place.
    await this.msgRepo.update(messageId, trimmed);
    // 2. Drop everything after it.
    await this.msgRepo.deleteAfter(conversationId, target.createdAt);

    // 3. Build prompt from history strictly BEFORE the edited message.
    const all = await this.msgRepo.findByConversation(conversationId);
    const history = all.filter((m) => m.createdAt < target.createdAt).slice(-10);
    const sessionCtx = await this.fetchSessionContext(conv.roomId, userId, true);
    const fullPrompt = this.buildPrompt(conv.context as AssistantContext, history, trimmed, sessionCtx);

    await this.streamAndSave(fullPrompt, messageId, conv, userId, emit, signal);
  }
}

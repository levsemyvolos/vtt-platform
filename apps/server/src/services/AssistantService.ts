import { randomUUID } from 'crypto';
import type { AIProvider } from '../infrastructure/ai/AIProvider.js';
import type { AssistantContext, AssistantTextRequest, AssistantTextResponse, AssistantMessageDTO, SaveAssistantMessageRequest, AssistantHistoryResponse } from '@vtt/shared';
import type { AssistantMessageRepository } from '../repositories/AssistantMessageRepository.js';

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
  ) {}

  /**
   * Persists a single assistant message to DB. Idempotent if called
   * with same content — just creates a new row with new UUID.
   */
  async saveMessage(
    req: SaveAssistantMessageRequest,
    userId: string | null,
  ): Promise<AssistantMessageDTO> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    const msg = await this.msgRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      ...(userId !== null ? { userId } : {}),
      role: req.role,
      content: req.content,
    });
    return {
      id: msg.id,
      roomId: msg.roomId,
      userId: msg.userId ?? null,
      role: msg.role as AssistantMessageDTO['role'],
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    };
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
    const content = await this.provider.generateText(fullPrompt);
    return { content };
  }
}

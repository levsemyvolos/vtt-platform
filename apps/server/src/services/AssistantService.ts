import type { AIProvider } from '../infrastructure/ai/AIProvider.js';
import type { AssistantContext, AssistantTextRequest, AssistantTextResponse } from '@vtt/shared';

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
  constructor(private readonly provider: AIProvider) {}

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

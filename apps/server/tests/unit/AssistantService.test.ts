import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

function makeProvider(text = 'mock response'): AIProvider {
  return {
    generateText: vi.fn().mockResolvedValue(text),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
  } as unknown as AIProvider;
}

const { AssistantService } = await import('../../src/services/AssistantService.js');

describe('AssistantService.generateAssistantText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('npc-description — includes system prompt and userPrompt in LLM call', async () => {
    const provider = makeProvider('A tall elf with silver eyes.');
    const svc = new AssistantService(provider);
    const result = await svc.generateAssistantText({
      context: 'npc-description',
      userPrompt: 'Describe an elven merchant.',
    });
    expect(result.content).toBe('A tall elf with silver eyes.');
    const called = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('Game Master D&D 5e');
    expect(called).toContain('Describe an elven merchant.');
  });

  it('scene-description — system prompt mentions сцену атмосферно', async () => {
    const provider = makeProvider('A dimly lit tavern...');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      context: 'scene-description',
      userPrompt: 'Describe a dark tavern.',
    });
    const called = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('атмосферно');
  });

  it('srd-lookup — system prompt mentions SRD reference', async () => {
    const provider = makeProvider('Grappling allows...');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      context: 'srd-lookup',
      userPrompt: 'How does grappling work?',
    });
    const called = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('SRD reference');
  });

  it('free-chat — conversationHistory is sliced to last 10 and included', async () => {
    const provider = makeProvider('Sure!');
    const svc = new AssistantService(provider);
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg-${i}`,
    }));
    await svc.generateAssistantText({
      context: 'free-chat',
      userPrompt: 'How many players should I have?',
      conversationHistory: history,
    });
    const called = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('msg-5'); // first of last-10
    expect(called).not.toContain('msg-4'); // 11th from end, should be excluded
    expect(called).toContain('msg-14'); // last message
  });
});

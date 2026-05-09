import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIProvider, TextGenerationRequest } from '../../src/infrastructure/ai/AIProvider.js';

function makeProvider(text = 'mock response'): AIProvider {
  return {
    generateText: vi.fn().mockResolvedValue(text),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
  } as unknown as AIProvider;
}

const { AssistantService } = await import('../../src/services/AssistantService.js');

/**
 * Returns the provider call's TextGenerationRequest as a flattened string
 * (system + user concatenated) for content-substring assertions. History items
 * are also folded in. This mirrors the pre-S6.1 single-string semantics so
 * rubric assertions remain valid for the prompt CONTENT (what we're checking).
 */
function flatPrompt(provider: AIProvider): string {
  const calls = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls as unknown as Array<[TextGenerationRequest, ...unknown[]]>;
  const r = calls[0]?.[0];
  if (!r) return '';
  const hist = r.history.map((m) => `${m.role}: ${m.content}`).join('\n');
  return `${r.system}\n\n${hist}\n\nUser: ${r.user}`;
}

describe('AssistantService.generateAssistantText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('npc-description — includes v2.0.0 system prompt structure and userPrompt in LLM call', async () => {
    const provider = makeProvider('A tall elf with silver eyes.');
    const svc = new AssistantService(provider);
    const result = await svc.generateAssistantText({
      context: 'npc-description',
      userPrompt: 'Describe an elven merchant.',
    });
    expect(result.content).toBe('A tall elf with silver eyes.');
    const called = flatPrompt(provider);
    expect(called).toMatch(/master-tier TTRPG|narrative designer/i);
    expect(called).toContain('**Зовнішність:**');
    expect(called).toContain('Describe an elven merchant.');
  });

  it('scene-description — emits TWO-PART read-aloud + GM notes structure', async () => {
    const provider = makeProvider('A dimly lit tavern...');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      context: 'scene-description',
      userPrompt: 'Describe a dark tavern.',
    });
    const called = flatPrompt(provider);
    expect(called).toContain('--- READ-ALOUD');
    expect(called).toContain('--- GM NOTES ---');
  });

  it('srd-lookup — uses Rules Arbitrator role with "I DO NOT KNOW" protocol', async () => {
    const provider = makeProvider('Grappling allows...');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      context: 'srd-lookup',
      userPrompt: 'How does grappling work?',
    });
    const called = flatPrompt(provider);
    expect(called).toContain('Rules Arbitrator');
    expect(called).toContain('I DO NOT KNOW');
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
    const called = flatPrompt(provider);
    expect(called).toContain('msg-5'); // first of last-10
    expect(called).not.toContain('msg-4'); // 11th from end, should be excluded
    expect(called).toContain('msg-14'); // last message
  });

  it('S6.1 role-split — system + history + user are passed as separate fields, not concatenated', async () => {
    const provider = makeProvider('mock');
    const svc = new AssistantService(provider);
    await svc.generateAssistantText({
      context: 'free-chat',
      userPrompt: 'CURRENT_USER',
      conversationHistory: [
        { role: 'user', content: 'past-user-1' },
        { role: 'assistant', content: 'past-assistant-1' },
      ],
    });
    const calls = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls as unknown as Array<[TextGenerationRequest, ...unknown[]]>;
    const r = calls[0]?.[0];
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.user).toBe('CURRENT_USER');
    expect(r.history).toHaveLength(2);
    expect(r.history[0]).toEqual({ role: 'user', content: 'past-user-1' });
    expect(r.history[1]).toEqual({ role: 'assistant', content: 'past-assistant-1' });
    expect(r.system).toMatch(/improvisational|Game Master Assistant/i);
    // User prompt MUST NOT leak into system instruction (history-spoof guard).
    expect(r.system).not.toContain('CURRENT_USER');
  });
});

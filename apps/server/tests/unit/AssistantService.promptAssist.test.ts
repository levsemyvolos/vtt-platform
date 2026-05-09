/**
 * S7.1 / P5.3 — AssistantService.generatePromptDraft.
 *
 * Mirrors the contract of `lookupSRD`: one-shot LLM call, no persistence,
 * no session-context, no history. Tests cover the SPECIAL SKILL system
 * prompt shape per AI_PROMPT_ENGINEERING_GUIDE.md §5.3 + input validation
 * + RBAC-agnosticism (the service trusts the route to gate GM-only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

describe('AssistantService.generatePromptDraft (Session 7.1, P5.3)', () => {
  let provider: AIProvider;
  let service: AssistantService;
  let generateText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    generateText = vi.fn().mockResolvedValue('IMAGE PROMPT: a lone knight, ...');
    provider = {
      generateText,
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateTextStream: vi.fn(),
    } as unknown as AIProvider;
    service = new AssistantService(provider, {} as AssistantMessageRepository, {} as AssistantConversationRepository);
  });

  it('image target — passes the SPECIAL SKILL system prompt with the IMAGE PROMPT formula', async () => {
    await service.generatePromptDraft({ roomId: 'r1', target: 'image', userPrompt: 'A wounded knight at dawn' });
    expect(generateText).toHaveBeenCalledTimes(1);
    const arg = generateText.mock.calls[0]?.[0] as { system: string; history: unknown[]; user: string };
    expect(arg.system).toContain('SPECIAL SKILL');
    expect(arg.system).toContain('IMAGE PROMPT:');
    expect(arg.system).toContain('[Subject]');
    expect(arg.system).toContain('[Composition]');
    expect(arg.system).toContain('[Constraints]');
    // The user message is tagged so the model dispatches on the right formula.
    expect(arg.user).toContain('[Target: image]');
    expect(arg.user).toContain('A wounded knight at dawn');
    expect(arg.history).toEqual([]);
  });

  it('music target — system prompt includes the MUSIC formula + hard-constraints block verbatim', async () => {
    await service.generatePromptDraft({ roomId: 'r1', target: 'music', userPrompt: 'Tense exploration in a cave' });
    const arg = generateText.mock.calls[0]?.[0] as { system: string; user: string };
    expect(arg.system).toContain('MUSIC PROMPT:');
    expect(arg.system).toContain('[Genre]');
    expect(arg.system).toContain('[Instrumentation]');
    expect(arg.system).toContain('instrumental only, no vocals, no prominent beat');
    expect(arg.user).toContain('[Target: music]');
  });

  it('returns the provider output verbatim wrapped in { draft }', async () => {
    generateText.mockResolvedValueOnce('MUSIC PROMPT: dungeon, dark ambient, eerie, low strings, slow tempo, dripping water, instrumental only, no vocals, no prominent beat');
    const out = await service.generatePromptDraft({ roomId: 'r1', target: 'music', userPrompt: 'cave' });
    expect(out).toEqual({
      draft: 'MUSIC PROMPT: dungeon, dark ambient, eerie, low strings, slow tempo, dripping water, instrumental only, no vocals, no prominent beat',
    });
  });

  it('throws INVALID_CONTENT on empty / whitespace-only userPrompt', async () => {
    await expect(service.generatePromptDraft({ roomId: 'r1', target: 'image', userPrompt: '   ' })).rejects.toThrow('INVALID_CONTENT');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('throws INVALID_CONTENT on userPrompt over 1000 chars', async () => {
    await expect(
      service.generatePromptDraft({ roomId: 'r1', target: 'image', userPrompt: 'a'.repeat(1001) }),
    ).rejects.toThrow('INVALID_CONTENT');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not write to repos (no conversation row, no message log)', async () => {
    const msgRepo = {
      create: vi.fn(), findByRoom: vi.fn(), findByConversation: vi.fn(),
      deleteAfter: vi.fn(), countUserMessagesByRoomSince: vi.fn(),
    } as unknown as AssistantMessageRepository;
    const convRepo = {
      findById: vi.fn(), create: vi.fn(), touch: vi.fn(),
      findByRoomAndOwner: vi.fn(), findLatestByRoomOwnerContext: vi.fn(),
    } as unknown as AssistantConversationRepository;
    const s = new AssistantService(provider, msgRepo, convRepo);
    await s.generatePromptDraft({ roomId: 'r1', target: 'image', userPrompt: 'A knight at dawn' });
    expect(msgRepo.create).not.toHaveBeenCalled();
    expect(convRepo.create).not.toHaveBeenCalled();
    expect(convRepo.touch).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

describe('AssistantService.lookupSRD', () => {
  let provider: AIProvider;
  let service: AssistantService;
  let generateText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    generateText = vi.fn().mockResolvedValue('Grapple is a special melee attack...');
    provider = {
      generateText,
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateTextStream: vi.fn(),
    } as unknown as AIProvider;
    service = new AssistantService(provider, {} as AssistantMessageRepository, {} as AssistantConversationRepository);
  });

  it('builds a SRD-only system prompt and returns provider output', async () => {
    const out = await service.lookupSRD('How does Grapple work?');
    expect(out).toBe('Grapple is a special melee attack...');
    expect(generateText).toHaveBeenCalledTimes(1);
    // S6.1: provider receives { system, history, user } object instead of flat string.
    const arg = generateText.mock.calls[0]?.[0] as { system: string; history: unknown[]; user: string };
    expect(arg.system).toContain('Rules Arbitrator');
    expect(arg.system).toContain('I DO NOT KNOW');
    expect(arg.history).toEqual([]); // single-turn — no history
    expect(arg.user).toBe('How does Grapple work?');
  });

  it('throws INVALID_CONTENT on empty prompt', async () => {
    await expect(service.lookupSRD('   ')).rejects.toThrow('INVALID_CONTENT');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('throws INVALID_CONTENT on prompt over 1000 chars', async () => {
    await expect(service.lookupSRD('a'.repeat(1001))).rejects.toThrow('INVALID_CONTENT');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not write to repos', async () => {
    const msgRepo = { create: vi.fn(), findByRoom: vi.fn(), findByConversation: vi.fn(), deleteAfter: vi.fn() } as unknown as AssistantMessageRepository;
    const convRepo = { findById: vi.fn(), create: vi.fn(), touch: vi.fn() } as unknown as AssistantConversationRepository;
    const s = new AssistantService(provider, msgRepo, convRepo);
    await s.lookupSRD('What is Counterspell?');
    expect(msgRepo.create).not.toHaveBeenCalled();
    expect(convRepo.create).not.toHaveBeenCalled();
    expect(convRepo.touch).not.toHaveBeenCalled();
  });
});

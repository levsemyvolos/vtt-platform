import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { SessionContextBuilder } from '../../src/services/SessionContextBuilder.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

const ROOM = '11111111-1111-1111-1111-111111111111';
const CONV = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeConv() {
  return {
    id: CONV,
    roomId: ROOM,
    ownerId: OWNER,
    context: 'free-chat',
    title: 'T',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AssistantService.getContextPreview (Session 5.2)', () => {
  let convRepo: AssistantConversationRepository;
  let msgRepo: AssistantMessageRepository;
  let builder: SessionContextBuilder;

  beforeEach(() => {
    convRepo = {
      findById: vi.fn().mockResolvedValue(makeConv()),
    } as unknown as AssistantConversationRepository;
    msgRepo = {} as unknown as AssistantMessageRepository;
    builder = {
      build: vi.fn().mockResolvedValue('**Поточна сцена:** Test'),
    } as unknown as SessionContextBuilder;
  });

  it('returns the builder output for the conversation owner', async () => {
    const service = new AssistantService({} as AIProvider, msgRepo, convRepo, builder);
    const text = await service.getContextPreview(CONV, OWNER);
    expect(text).toBe('**Поточна сцена:** Test');
    expect(builder.build).toHaveBeenCalledWith(ROOM, OWNER);
  });

  it('throws FORBIDDEN when caller is not the owner', async () => {
    const service = new AssistantService({} as AIProvider, msgRepo, convRepo, builder);
    await expect(service.getContextPreview(CONV, OTHER)).rejects.toThrow('FORBIDDEN');
  });

  it('returns empty string when builder is not wired', async () => {
    const service = new AssistantService({} as AIProvider, msgRepo, convRepo, undefined);
    const text = await service.getContextPreview(CONV, OWNER);
    expect(text).toBe('');
  });
});

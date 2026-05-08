import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';
import type { AssistantStreamEvent } from '@vtt/shared';

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

function streamingProvider(chunks: string[]): AIProvider {
  return {
    generateText: vi.fn(),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
    generateTextStream: vi.fn().mockImplementation(async function* () {
      for (const c of chunks) yield c;
    }),
  } as unknown as AIProvider;
}

describe('AssistantService.regenerateAndStream + editAndStream (Session 4.3)', () => {
  let convRepo: AssistantConversationRepository;
  let msgRepo: AssistantMessageRepository;

  beforeEach(() => {
    convRepo = {
      findById: vi.fn().mockResolvedValue(makeConv()),
      touch: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssistantConversationRepository;
    msgRepo = {
      findByConversation: vi.fn().mockResolvedValue([
        { id: 'u1', role: 'user', content: 'hi', createdAt: new Date('2026-05-01') },
        { id: 'a1', role: 'assistant', content: 'hello', createdAt: new Date('2026-05-02') },
        { id: 'u2', role: 'user', content: 'go on', createdAt: new Date('2026-05-03') },
        { id: 'a2', role: 'assistant', content: 'sure', createdAt: new Date('2026-05-04') },
      ]),
      findById: vi.fn(),
      update: vi.fn().mockImplementation((id, content) => Promise.resolve({ id, content })),
      deleteAfter: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date() })),
    } as unknown as AssistantMessageRepository;
  });

  it('regenerate: drops last assistant, streams new one based on last user', async () => {
    const service = new AssistantService(streamingProvider(['New ', 'reply']), msgRepo, convRepo);
    const events: AssistantStreamEvent[] = [];
    await service.regenerateAndStream(CONV, OWNER, (e) => events.push(e));
    // deleteAfter called with last user message's createdAt (2026-05-03)
    expect(msgRepo.deleteAfter).toHaveBeenCalledWith(CONV, new Date('2026-05-03'));
    // assistant message created with new content
    expect(msgRepo.create).toHaveBeenCalledTimes(1);
    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.content).toBe('New reply');
    expect(convRepo.touch).toHaveBeenCalledWith(CONV);
  });

  it('regenerate: throws FORBIDDEN for non-owner', async () => {
    const service = new AssistantService(streamingProvider([]), msgRepo, convRepo);
    await expect(service.regenerateAndStream(CONV, OTHER, () => {})).rejects.toThrow('FORBIDDEN');
  });

  it('edit: updates user message, drops after, restreams', async () => {
    (msgRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      conversationId: CONV,
      role: 'user',
      content: 'hi',
      createdAt: new Date('2026-05-01'),
    });
    const service = new AssistantService(streamingProvider(['Edited ', 'response']), msgRepo, convRepo);
    const events: AssistantStreamEvent[] = [];
    await service.editAndStream(CONV, 'u1', 'hello edited', OWNER, (e) => events.push(e));
    expect(msgRepo.update).toHaveBeenCalledWith('u1', 'hello edited');
    expect(msgRepo.deleteAfter).toHaveBeenCalledWith(CONV, new Date('2026-05-01'));
    expect(msgRepo.create).toHaveBeenCalledTimes(1);
    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.content).toBe('Edited response');
  });

  it('edit: throws INVALID_TARGET for non-user message', async () => {
    (msgRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1',
      conversationId: CONV,
      role: 'assistant',
      content: 'hello',
      createdAt: new Date('2026-05-02'),
    });
    const service = new AssistantService(streamingProvider([]), msgRepo, convRepo);
    await expect(
      service.editAndStream(CONV, 'a1', 'edit', OWNER, () => {}),
    ).rejects.toThrow('INVALID_TARGET');
  });
});

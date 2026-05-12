import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';
import type { AssistantStreamEvent } from '@vtt/shared';

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeConv() {
  return {
    id: CONV_ID,
    roomId: ROOM_ID,
    ownerId: OWNER_ID,
    context: 'free-chat',
    title: 'T',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeProviderStream(chunks: string[], signalCheck?: AbortSignal): AIProvider {
  return {
    generateText: vi.fn(),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
    generateTextStream: vi.fn().mockImplementation(async function* () {
      for (const c of chunks) {
        if (signalCheck?.aborted) return;
        yield c;
      }
    }),
  } as unknown as AIProvider;
}

describe('AssistantService.streamAndPersist', () => {
  let convRepo: AssistantConversationRepository;
  let msgRepo: AssistantMessageRepository;

  beforeEach(() => {
    convRepo = {
      findById: vi.fn().mockResolvedValue(makeConv()),
      touch: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssistantConversationRepository;
    msgRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date() })),
      findByConversation: vi.fn().mockResolvedValue([]),
    } as unknown as AssistantMessageRepository;
  });

  it('emits start → chunks → done and writes both messages', async () => {
    const provider = makeProviderStream(['Hello ', 'world']);
    const service = new AssistantService(provider, msgRepo, convRepo);
    const events: AssistantStreamEvent[] = [];
    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi' },
      OWNER_ID,
      (e) => events.push(e),
    );
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('start');
    expect(types).toContain('chunk');
    expect(types[types.length - 1]).toBe('done');
    expect(msgRepo.create).toHaveBeenCalledTimes(2);
    expect(convRepo.touch).toHaveBeenCalledWith(CONV_ID);
    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.content).toBe('Hello world');
  });

  it('throws NOT_FOUND when conversation missing', async () => {
    (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const service = new AssistantService(makeProviderStream([]), msgRepo, convRepo);
    await expect(
      service.streamAndPersist(
        { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi' },
        OWNER_ID,
        () => {},
      ),
    ).rejects.toThrow('NOT_FOUND');
    expect(msgRepo.create).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when caller is not the owner', async () => {
    const service = new AssistantService(makeProviderStream([]), msgRepo, convRepo);
    await expect(
      service.streamAndPersist(
        { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi' },
        OTHER_ID,
        () => {},
      ),
    ).rejects.toThrow('FORBIDDEN');
    expect(msgRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT save assistant message when signal aborts mid-stream', async () => {
    const ctrl = new AbortController();
    let yieldCount = 0;
    const provider: AIProvider = {
      generateText: vi.fn(),
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateTextStream: vi.fn().mockImplementation(async function* () {
        yield 'first';
        yieldCount++;
        ctrl.abort();
        yield 'second';
        yieldCount++;
      }),
    } as unknown as AIProvider;
    const service = new AssistantService(provider, msgRepo, convRepo);
    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi' },
      OWNER_ID,
      () => {},
      ctrl.signal,
    );
    // user message saved (1) but assistant NOT saved (no second create call).
    expect(msgRepo.create).toHaveBeenCalledTimes(1);
    expect(convRepo.touch).not.toHaveBeenCalled();
    void yieldCount;
  });

  it('injects session context into the prompt when useSessionContext=true', async () => {
    const fakeBuilder = {
      build: vi.fn().mockResolvedValue('**Поточна сцена:** Test'),
    } as unknown as import('../../src/services/SessionContextBuilder.js').SessionContextBuilder;
    let capturedPrompt = '';
    const provider: AIProvider = {
      generateText: vi.fn(),
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateTextStream: vi.fn().mockImplementation(async function* (req: { system: string; user: string; history: { role: string; content: string }[] }) {
        // S6.1 role-split — flatten provider call back to a single string for substring assertions.
        capturedPrompt = `${req.system}\n\n${req.history.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\nUser: ${req.user}`;
        yield 'ok';
      }),
    } as unknown as AIProvider;
    const service = new AssistantService(provider, msgRepo, convRepo, fakeBuilder);
    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi', useSessionContext: true },
      OWNER_ID,
      () => {},
    );
    expect(capturedPrompt).toContain('Контекст сесії');
    expect(capturedPrompt).toContain('Поточна сцена');
    expect(fakeBuilder.build).toHaveBeenCalledWith(ROOM_ID, OWNER_ID);
  });

  it('skips session context when useSessionContext=false', async () => {
    const fakeBuilder = {
      build: vi.fn().mockResolvedValue('**Поточна сцена:** Test'),
    } as unknown as import('../../src/services/SessionContextBuilder.js').SessionContextBuilder;
    let capturedPrompt = '';
    const provider: AIProvider = {
      generateText: vi.fn(),
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateTextStream: vi.fn().mockImplementation(async function* (req: { system: string; user: string; history: { role: string; content: string }[] }) {
        // S6.1 role-split — flatten provider call back to a single string for substring assertions.
        capturedPrompt = `${req.system}\n\n${req.history.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\nUser: ${req.user}`;
        yield 'ok';
      }),
    } as unknown as AIProvider;
    const service = new AssistantService(provider, msgRepo, convRepo, fakeBuilder);
    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi', useSessionContext: false },
      OWNER_ID,
      () => {},
    );
    expect(capturedPrompt).not.toContain('Контекст сесії');
    expect(fakeBuilder.build).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider, TextGenerationRequest } from '../../src/infrastructure/ai/AIProvider.js';
import type { AssistantStreamEvent, NpcResponse } from '@vtt/shared';

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeNpcConv() {
  return {
    id: CONV_ID,
    roomId: ROOM_ID,
    ownerId: OWNER_ID,
    context: 'npc-description',
    title: 'NPC',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const VALID_NPC: NpcResponse = {
  npc_core: {
    full_name: 'Магда Залізнобока',
    concept: 'world-weary stoic guardian',
    appearance: 'Шрам через ліву щоку. Носить кольчугу.',
  },
  roleplay: {
    verbal_mannerism: 'Завжди закінчує фразу питанням.',
    physical_mannerism: 'Стукає монетою по столу, коли нервує.',
    motivation: 'Захистити доньку від гільдії.',
    sample_dialogue: 'Знаєте, що буває з тими, хто бреше мені?',
  },
  psychology: {
    dominant_trait: 'Безстрашна.',
    fatal_flaw: 'Здригається від крику.',
    contradiction: 'Не боїться смерті, але панікує від голосу батька.',
  },
  narrative: {
    secret: 'Працює на дві сторони.',
    plot_hook: 'Шукає ключ від храму.',
  },
  statblock: {
    system: 'D&D 5e (SRD 5.1)',
    cr_or_level: 'CR 3',
    hp: 45,
    ac: 16,
    speed: '30 ft.',
    primary_attack: 'Greatsword +5, 2d6+3 slashing',
    special_ability: 'Action Surge 1/short rest',
    assumptions: 'Немає',
  },
};

function makeProviderJson(jsonOutput: string): {
  provider: AIProvider;
  capturedRequests: TextGenerationRequest[];
} {
  const capturedRequests: TextGenerationRequest[] = [];
  const provider: AIProvider = {
    generateText: vi.fn().mockImplementation((req: TextGenerationRequest) => {
      capturedRequests.push(req);
      return Promise.resolve(jsonOutput);
    }),
    generateTextStream: vi.fn(),
    generateImage: vi.fn(),
    generateToken: vi.fn(),
    generateBattlemap: vi.fn(),
    generateImageMultiTurn: vi.fn(),
    generateMusic: vi.fn(),
  };
  return { provider, capturedRequests };
}

describe('AssistantService NPC JSON path', () => {
  let convRepo: AssistantConversationRepository;
  let msgRepo: AssistantMessageRepository;

  beforeEach(() => {
    convRepo = {
      findById: vi.fn().mockResolvedValue(makeNpcConv()),
      touch: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssistantConversationRepository;
    msgRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date() })),
      findByConversation: vi.fn().mockResolvedValue([]),
    } as unknown as AssistantMessageRepository;
  });

  it('routes npc-description through generateText (NOT generateTextStream)', async () => {
    const json = JSON.stringify(VALID_NPC);
    const { provider } = makeProviderJson(json);
    const service = new AssistantService(provider, msgRepo, convRepo);

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'npc-description', userPrompt: 'tavern keeper' },
      OWNER_ID,
      () => {},
    );

    expect(provider.generateText).toHaveBeenCalledTimes(1);
    expect(provider.generateTextStream).not.toHaveBeenCalled();
  });

  it('passes responseMimeType=application/json + schema to provider', async () => {
    const json = JSON.stringify(VALID_NPC);
    const { provider, capturedRequests } = makeProviderJson(json);
    const service = new AssistantService(provider, msgRepo, convRepo);

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'npc-description', userPrompt: 'guard captain' },
      OWNER_ID,
      () => {},
    );

    expect(capturedRequests).toHaveLength(1);
    const req = capturedRequests[0]!;
    expect(req.responseMimeType).toBe('application/json');
    expect(req.responseSchema).toBeDefined();
    expect(req.responseSchema!.type).toBe('OBJECT');
    expect(req.responseSchema!.properties).toBeDefined();
    expect(Object.keys(req.responseSchema!.properties as object)).toEqual(
      expect.arrayContaining(['npc_core', 'roleplay', 'psychology', 'narrative', 'statblock']),
    );
  });

  it('appends NPC_JSON_INSTRUCTION to system prompt (asks for JSON output)', async () => {
    const json = JSON.stringify(VALID_NPC);
    const { provider, capturedRequests } = makeProviderJson(json);
    const service = new AssistantService(provider, msgRepo, convRepo);

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'npc-description', userPrompt: 'merchant' },
      OWNER_ID,
      () => {},
    );

    const sys = capturedRequests[0]!.system;
    expect(sys).toContain('JSON MODE');
    expect(sys).toContain('npc_core');
    expect(sys).toContain('LICENSE-BOUNDED REFUSAL');
  });

  it('emits start → chunk(full JSON) → done with canonical content', async () => {
    const json = JSON.stringify(VALID_NPC);
    const { provider } = makeProviderJson(json);
    const service = new AssistantService(provider, msgRepo, convRepo);
    const events: AssistantStreamEvent[] = [];

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'npc-description', userPrompt: 'cult fanatic' },
      OWNER_ID,
      (e) => events.push(e),
    );

    expect(events.map((e) => e.type)).toEqual(['start', 'chunk', 'done']);
    const done = events[2];
    expect(done && done.type === 'done').toBe(true);
    if (done && done.type === 'done') {
      // Canonical JSON — round-trip parse succeeds.
      const parsed = JSON.parse(done.content) as NpcResponse;
      expect(parsed.npc_core.full_name).toBe('Магда Залізнобока');
    }
  });

  it('persists assistant message with canonical JSON content', async () => {
    const json = `\n  ${JSON.stringify(VALID_NPC)}  \n`; // pad with whitespace
    const { provider } = makeProviderJson(json);
    const service = new AssistantService(provider, msgRepo, convRepo);

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'npc-description', userPrompt: 'mysterious traveler' },
      OWNER_ID,
      () => {},
    );

    expect(msgRepo.create).toHaveBeenCalledTimes(2); // user + assistant
    const calls = (msgRepo.create as ReturnType<typeof vi.fn>).mock.calls;
    const assistantCall = calls.find((c) => (c[0] as { role: string }).role === 'assistant');
    expect(assistantCall).toBeDefined();
    const stored = (assistantCall![0] as { content: string }).content;
    // Stored content must round-trip parse cleanly with no leading whitespace.
    expect(stored.startsWith('{')).toBe(true);
    expect(() => JSON.parse(stored)).not.toThrow();
  });

  it('preserves raw output when JSON parse fails (graceful degradation)', async () => {
    // Truncated JSON — parse will throw, service stores raw text instead.
    const broken = '{"npc_core": {"full_name":"Magda"';
    const { provider } = makeProviderJson(broken);
    const service = new AssistantService(provider, msgRepo, convRepo);
    const events: AssistantStreamEvent[] = [];

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'npc-description', userPrompt: 'broken' },
      OWNER_ID,
      (e) => events.push(e),
    );

    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.content).toBe(broken);
  });

  it('non-NPC contexts still use streaming (free-chat path)', async () => {
    convRepo = {
      findById: vi.fn().mockResolvedValue({ ...makeNpcConv(), context: 'free-chat' }),
      touch: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssistantConversationRepository;

    const provider: AIProvider = {
      generateText: vi.fn(),
      generateTextStream: vi.fn().mockImplementation(async function* () {
        yield 'streamed ';
        yield 'reply';
      }),
      generateImage: vi.fn(),
      generateToken: vi.fn(),
      generateBattlemap: vi.fn(),
      generateImageMultiTurn: vi.fn(),
      generateMusic: vi.fn(),
    };
    const service = new AssistantService(provider, msgRepo, convRepo);

    await service.streamAndPersist(
      { roomId: ROOM_ID, conversationId: CONV_ID, context: 'free-chat', userPrompt: 'hi' },
      OWNER_ID,
      () => {},
    );

    expect(provider.generateTextStream).toHaveBeenCalledTimes(1);
    expect(provider.generateText).not.toHaveBeenCalled();
  });
});

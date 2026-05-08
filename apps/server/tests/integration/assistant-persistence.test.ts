/**
 * AI Assistant persistence — integration tests (Wave 6.4.3).
 *
 * Tests AssistantService.saveMessage() and AssistantService.getHistory()
 * using stub repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

const ROOM_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function makeAiProvider(): AIProvider {
  return {} as AIProvider;
}

function makeConvRepo(): AssistantConversationRepository {
  const conv = {
    id: 'conv-1',
    roomId: ROOM_ID,
    ownerId: USER_ID,
    context: 'free-chat',
    title: 'Default',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    findLatestByRoomOwnerContext: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(conv),
    touch: vi.fn().mockResolvedValue(conv),
  } as unknown as AssistantConversationRepository;
}

function makeMsgRepo(): AssistantMessageRepository {
  const rows: Array<{
    id: string;
    roomId: string;
    userId: string | null;
    role: string;
    content: string;
    createdAt: Date;
  }> = [];

  return {
    create: vi.fn().mockImplementation((data) => {
      const row = { ...data, userId: data.userId ?? null, createdAt: new Date() };
      rows.push(row);
      return Promise.resolve(row);
    }),
    findByRoom: vi.fn().mockImplementation((roomId: string) => {
      return Promise.resolve(rows.filter((r) => r.roomId === roomId));
    }),
  } as unknown as AssistantMessageRepository;
}

describe('AssistantService persistence', () => {
  let service: AssistantService;
  let repo: AssistantMessageRepository;

  beforeEach(() => {
    repo = makeMsgRepo();
    service = new AssistantService(makeAiProvider(), repo, makeConvRepo());
  });

  it('saveMessage stores a user message and returns DTO', async () => {
    const dto = await service.saveMessage({ roomId: ROOM_ID, role: 'user', content: 'Hello GM!' }, USER_ID);
    expect(dto.roomId).toBe(ROOM_ID);
    expect(dto.role).toBe('user');
    expect(dto.content).toBe('Hello GM!');
    expect(dto.userId).toBe(USER_ID);
    expect(dto.createdAt).toBeTruthy();
  });

  it('saveMessage throws when userId is null (bridge requires non-null userId)', async () => {
    await expect(
      service.saveMessage({ roomId: ROOM_ID, role: 'assistant', content: 'Here is some lore.' }, null),
    ).rejects.toThrow('saveMessage bridge requires non-null userId');
  });

  it('getHistory returns saved messages oldest-first', async () => {
    await service.saveMessage({ roomId: ROOM_ID, role: 'user', content: 'First' }, USER_ID);
    await service.saveMessage({ roomId: ROOM_ID, role: 'assistant', content: 'Second' }, USER_ID);
    const history = await service.getHistory(ROOM_ID);
    expect(history.messages).toHaveLength(2);
    expect(history.messages[0]?.content).toBe('First');
    expect(history.messages[1]?.content).toBe('Second');
  });

  it('getHistory returns empty array for unknown room', async () => {
    const history = await service.getHistory('00000000-0000-0000-0000-000000000000');
    expect(history.messages).toHaveLength(0);
  });

  it('saveMessage without repo throws error', async () => {
    const bareService = new AssistantService(makeAiProvider());
    await expect(
      bareService.saveMessage({ roomId: ROOM_ID, role: 'user', content: 'test' }, USER_ID),
    ).rejects.toThrow('AssistantMessageRepository not wired');
  });

  it('getHistory without repo returns empty', async () => {
    const bareService = new AssistantService(makeAiProvider());
    const result = await bareService.getHistory(ROOM_ID);
    expect(result.messages).toHaveLength(0);
  });
});

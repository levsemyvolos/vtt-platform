/**
 * AI Assistant persistence — integration tests (Wave 6.4.3).
 *
 * Tests AssistantService.saveMessage() and AssistantService.getHistory()
 * using stub repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

const ROOM_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function makeAiProvider(): AIProvider {
  return {} as AIProvider;
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
    service = new AssistantService(makeAiProvider(), repo);
  });

  it('saveMessage stores a user message and returns DTO', async () => {
    const dto = await service.saveMessage({ roomId: ROOM_ID, role: 'user', content: 'Hello GM!' }, USER_ID);
    expect(dto.roomId).toBe(ROOM_ID);
    expect(dto.role).toBe('user');
    expect(dto.content).toBe('Hello GM!');
    expect(dto.userId).toBe(USER_ID);
    expect(dto.createdAt).toBeTruthy();
  });

  it('saveMessage stores an assistant message with null userId', async () => {
    const dto = await service.saveMessage({ roomId: ROOM_ID, role: 'assistant', content: 'Here is some lore.' }, null);
    expect(dto.role).toBe('assistant');
    expect(dto.userId).toBeNull();
  });

  it('getHistory returns saved messages oldest-first', async () => {
    await service.saveMessage({ roomId: ROOM_ID, role: 'user', content: 'First' }, USER_ID);
    await service.saveMessage({ roomId: ROOM_ID, role: 'assistant', content: 'Second' }, null);
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

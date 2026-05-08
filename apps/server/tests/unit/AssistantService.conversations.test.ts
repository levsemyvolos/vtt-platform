import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeConv(overrides: Partial<{ id: string; roomId: string; ownerId: string; context: string; title: string }> = {}) {
  return {
    id: overrides.id ?? CONV_ID,
    roomId: overrides.roomId ?? ROOM_ID,
    ownerId: overrides.ownerId ?? OWNER_ID,
    context: overrides.context ?? 'free-chat',
    title: overrides.title ?? 'Test',
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-02'),
  };
}

function makeAiProvider(): AIProvider {
  return {} as AIProvider;
}

describe('AssistantService — conversation management (Session 3.1)', () => {
  let convRepo: AssistantConversationRepository;
  let msgRepo: AssistantMessageRepository;
  let service: AssistantService;

  beforeEach(() => {
    convRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByRoomAndOwner: vi.fn(),
      findLatestByRoomOwnerContext: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      touch: vi.fn(),
    } as unknown as AssistantConversationRepository;
    msgRepo = {
      create: vi.fn(),
      findByRoom: vi.fn(),
      findByConversation: vi.fn(),
      deleteAfter: vi.fn(),
    } as unknown as AssistantMessageRepository;
    service = new AssistantService(makeAiProvider(), msgRepo, convRepo);
  });

  describe('listConversations', () => {
    it('returns DTOs for the calling owner only', async () => {
      (convRepo.findByRoomAndOwner as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeConv({ id: 'c1', title: 'A' }),
        makeConv({ id: 'c2', title: 'B' }),
      ]);
      const result = await service.listConversations(ROOM_ID, OWNER_ID);
      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0]?.title).toBe('A');
      expect(convRepo.findByRoomAndOwner).toHaveBeenCalledWith(ROOM_ID, OWNER_ID);
    });
  });

  describe('createConversation', () => {
    it('creates with default title when title omitted', async () => {
      (convRepo.create as ReturnType<typeof vi.fn>).mockImplementation((data) =>
        Promise.resolve(makeConv({ id: data.id, title: data.title, context: data.context }))
      );
      const dto = await service.createConversation({ roomId: ROOM_ID, context: 'npc-description' }, OWNER_ID);
      expect(dto.context).toBe('npc-description');
      expect(dto.title).toBe('Новий NPC');
    });

    it('uses trimmed/clipped custom title when provided', async () => {
      (convRepo.create as ReturnType<typeof vi.fn>).mockImplementation((data) =>
        Promise.resolve(makeConv({ id: data.id, title: data.title, context: data.context }))
      );
      const dto = await service.createConversation(
        { roomId: ROOM_ID, context: 'free-chat', title: '   My title   ' },
        OWNER_ID,
      );
      expect(dto.title).toBe('My title');
    });
  });

  describe('renameConversation', () => {
    it('renames when caller is owner', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      (convRepo.rename as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv({ title: 'New' }));
      const dto = await service.renameConversation(CONV_ID, { title: 'New' }, OWNER_ID);
      expect(dto.title).toBe('New');
    });

    it('throws NOT_FOUND when conversation missing', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(
        service.renameConversation(CONV_ID, { title: 'New' }, OWNER_ID),
      ).rejects.toThrow('NOT_FOUND');
    });

    it('throws FORBIDDEN when caller is not the owner', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      await expect(
        service.renameConversation(CONV_ID, { title: 'New' }, OTHER_USER),
      ).rejects.toThrow('FORBIDDEN');
    });

    it('throws INVALID_TITLE on empty title', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      await expect(
        service.renameConversation(CONV_ID, { title: '   ' }, OWNER_ID),
      ).rejects.toThrow('INVALID_TITLE');
    });
  });

  describe('deleteConversation', () => {
    it('deletes when owner', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      (convRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.deleteConversation(CONV_ID, OWNER_ID);
      expect(convRepo.delete).toHaveBeenCalledWith(CONV_ID);
    });

    it('throws NOT_FOUND when conversation missing', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(service.deleteConversation(CONV_ID, OWNER_ID)).rejects.toThrow('NOT_FOUND');
    });

    it('throws FORBIDDEN when caller not owner', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      await expect(service.deleteConversation(CONV_ID, OTHER_USER)).rejects.toThrow('FORBIDDEN');
    });
  });

  describe('getConversationMessages', () => {
    it('returns messages of the conversation when owner', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      (msgRepo.findByConversation as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'm1', roomId: ROOM_ID, userId: OWNER_ID, role: 'user', content: 'hi', createdAt: new Date('2026-05-01') },
        { id: 'm2', roomId: ROOM_ID, userId: null, role: 'assistant', content: 'hello', createdAt: new Date('2026-05-02') },
      ]);
      const result = await service.getConversationMessages(CONV_ID, OWNER_ID);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[1]?.userId).toBe(null);
    });

    it('throws FORBIDDEN when caller not owner', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeConv());
      await expect(service.getConversationMessages(CONV_ID, OTHER_USER)).rejects.toThrow('FORBIDDEN');
    });

    it('throws NOT_FOUND when conversation missing', async () => {
      (convRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(service.getConversationMessages(CONV_ID, OWNER_ID)).rejects.toThrow('NOT_FOUND');
    });
  });
});

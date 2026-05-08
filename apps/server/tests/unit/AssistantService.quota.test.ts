import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantService } from '../../src/services/AssistantService.js';
import type { AssistantMessageRepository } from '../../src/repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../../src/repositories/AssistantConversationRepository.js';
import type { AssetRepository } from '../../src/repositories/AssetRepository.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

const ROOM = '11111111-1111-1111-1111-111111111111';

describe('AssistantService.getRoomQuota (Session 6.3.B)', () => {
  let msgRepo: AssistantMessageRepository;
  let assetRepo: AssetRepository;
  let convRepo: AssistantConversationRepository;

  beforeEach(() => {
    msgRepo = {
      countUserMessagesByRoomSince: vi.fn().mockResolvedValue(7),
    } as unknown as AssistantMessageRepository;
    assetRepo = {
      countByRoomAndSource: vi.fn().mockImplementation((_, src) => Promise.resolve(src === 'AI_IMAGE' ? 12 : 4)),
      countByRoomAndSourceSince: vi.fn().mockImplementation((_, src) => Promise.resolve(src === 'AI_IMAGE' ? 3 : 1)),
    } as unknown as AssetRepository;
    convRepo = {} as AssistantConversationRepository;
  });

  it('aggregates images / audio / llm counts', async () => {
    const service = new AssistantService({} as AIProvider, msgRepo, convRepo, undefined, assetRepo);
    const quota = await service.getRoomQuota(ROOM);
    expect(quota.images.last24h).toBe(3);
    expect(quota.images.total).toBe(12);
    expect(quota.audio.last24h).toBe(1);
    expect(quota.audio.total).toBe(4);
    expect(quota.llm.messagesLast24h).toBe(7);
  });

  it('returns zeros when assetRepo is not wired', async () => {
    const service = new AssistantService({} as AIProvider, msgRepo, convRepo, undefined, undefined);
    const quota = await service.getRoomQuota(ROOM);
    expect(quota.images.total).toBe(0);
    expect(quota.audio.total).toBe(0);
    expect(quota.llm.messagesLast24h).toBe(7);
  });

  it('passes the same `since` cutoff to image and audio queries', async () => {
    const service = new AssistantService({} as AIProvider, msgRepo, convRepo, undefined, assetRepo);
    await service.getRoomQuota(ROOM);
    const imgCall = (assetRepo.countByRoomAndSourceSince as ReturnType<typeof vi.fn>).mock.calls[0];
    const audCall = (assetRepo.countByRoomAndSourceSince as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(imgCall?.[2]).toEqual(audCall?.[2]);
    // The cutoff should be ~24h ago, not in the future.
    const cutoff = imgCall?.[2] as Date;
    expect(cutoff.getTime()).toBeLessThan(Date.now());
    expect(cutoff.getTime()).toBeGreaterThan(Date.now() - 25 * 60 * 60 * 1000);
  });
});

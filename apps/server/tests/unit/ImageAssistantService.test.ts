import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageAssistantService } from '../../src/services/ImageAssistantService.js';
import type { AssistantImageConversationRepository } from '../../src/repositories/AssistantImageConversationRepository.js';
import type { AssetService } from '../../src/services/AssetService.js';
import type { AssetRepository } from '../../src/repositories/AssetRepository.js';
import type { FileStorageAdapter } from '../../src/infrastructure/storage/FileStorageAdapter.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';

const ROOM = '11111111-1111-1111-1111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONV = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeConv() {
  return {
    id: CONV, roomId: ROOM, ownerId: OWNER, title: 'Test',
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function makeProvider(generated = { bytes: Buffer.from('img'), mimeType: 'image/png' }): AIProvider {
  return {
    generateText: vi.fn(),
    generateTextStream: vi.fn(),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
    generateImageMultiTurn: vi.fn().mockResolvedValue(generated),
  } as unknown as AIProvider;
}

describe('ImageAssistantService (Session 7.1)', () => {
  let imageRepo: AssistantImageConversationRepository;
  let assetService: AssetService;
  let assetRepo: AssetRepository;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    imageRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date(), updatedAt: new Date() })),
      findById: vi.fn().mockResolvedValue(makeConv()),
      findByRoomAndOwner: vi.fn().mockResolvedValue([]),
      rename: vi.fn(),
      delete: vi.fn(),
      touch: vi.fn().mockResolvedValue(undefined),
      listTurns: vi.fn().mockResolvedValue([]),
      appendTurn: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date() })),
      countTurns: vi.fn().mockResolvedValue(0),
    } as unknown as AssistantImageConversationRepository;
    assetService = {
      storeAiAsset: vi.fn().mockResolvedValue({ id: 'gen-asset-1', roomId: ROOM, mimeType: 'image/png' }),
    } as unknown as AssetService;
    assetRepo = {
      findById: vi.fn(),
    } as unknown as AssetRepository;
    storage = {
      statObject: vi.fn().mockResolvedValue({ size: 100 }),
      createReadStream: vi.fn(),
    } as unknown as FileStorageAdapter;
  });

  it('createConversation: persists with default title when omitted', async () => {
    const service = new ImageAssistantService(makeProvider(), imageRepo, assetService, assetRepo, storage);
    const dto = await service.createConversation(ROOM, OWNER, '');
    expect(dto.title).toBe('Нова сцена');
    expect(dto.ownerId).toBe(OWNER);
  });

  it('continueConversation: rejects FORBIDDEN for non-owner', async () => {
    const service = new ImageAssistantService(makeProvider(), imageRepo, assetService, assetRepo, storage);
    await expect(
      service.continueConversation(CONV, 'red dragon', [], OTHER),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('continueConversation: rejects TOO_MANY_REFERENCES with > 3 refs', async () => {
    const service = new ImageAssistantService(makeProvider(), imageRepo, assetService, assetRepo, storage);
    await expect(
      service.continueConversation(CONV, 'red dragon', ['a', 'b', 'c', 'd'], OWNER),
    ).rejects.toThrow('TOO_MANY_REFERENCES');
  });

  it('continueConversation: happy path persists turn and asset', async () => {
    const service = new ImageAssistantService(makeProvider(), imageRepo, assetService, assetRepo, storage);
    const result = await service.continueConversation(CONV, 'a red dragon', [], OWNER);
    expect(result.generatedAssetId).toBe('gen-asset-1');
    expect(result.turnIndex).toBe(0);
    expect(imageRepo.appendTurn).toHaveBeenCalledTimes(1);
    expect(assetService.storeAiAsset).toHaveBeenCalledTimes(1);
  });

  it('renameConversation: throws INVALID_TITLE on empty', async () => {
    const service = new ImageAssistantService(makeProvider(), imageRepo, assetService, assetRepo, storage);
    await expect(service.renameConversation(CONV, '   ', OWNER)).rejects.toThrow('INVALID_TITLE');
  });
});

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { AssetService } from '../../src/services/AssetService.js';
import type { AIProvider, GeneratedBinary } from '../../src/infrastructure/ai/AIProvider.js';
import type {
  FileStorageAdapter,
  PutObjectInput,
} from '../../src/infrastructure/storage/FileStorageAdapter.js';
import type { AssetRepository } from '../../src/repositories/AssetRepository.js';
import type { Asset } from '@prisma/client';

interface AiMocks {
  generateText: MockedFunction<AIProvider['generateText']>;
  generateImage: MockedFunction<AIProvider['generateImage']>;
  generateMusic: MockedFunction<AIProvider['generateMusic']>;
}

interface StorageMocks {
  put: MockedFunction<FileStorageAdapter['put']>;
  getPresignedUrl: MockedFunction<FileStorageAdapter['getPresignedUrl']>;
  delete: MockedFunction<FileStorageAdapter['delete']>;
}

interface RepoMocks {
  findById: MockedFunction<AssetRepository['findById']>;
  create: MockedFunction<AssetRepository['create']>;
  deleteById: MockedFunction<AssetRepository['deleteById']>;
}

function makeAi(): { provider: AIProvider; mocks: AiMocks } {
  const mocks: AiMocks = {
    generateText: vi.fn(),
    generateImage: vi.fn(),
    generateMusic: vi.fn(),
  };
  return { provider: mocks as unknown as AIProvider, mocks };
}

function makeStorage(): { storage: FileStorageAdapter; mocks: StorageMocks } {
  const mocks: StorageMocks = {
    put: vi.fn(),
    getPresignedUrl: vi.fn(),
    delete: vi.fn(),
  };
  return { storage: mocks as unknown as FileStorageAdapter, mocks };
}

interface RepoMocksExt extends RepoMocks {
  findByRoomAndType: MockedFunction<AssetRepository['findByRoomAndType']>;
}

function makeRepo(): { repo: AssetRepository; mocks: RepoMocksExt } {
  const mocks: RepoMocksExt = {
    findById: vi.fn(),
    create: vi.fn(),
    deleteById: vi.fn(),
    findByRoomAndType: vi.fn(),
  };
  return { repo: mocks as unknown as AssetRepository, mocks };
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('AssetService.storeAiAsset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads bytes and persists metadata in parallel (par-block of sequence А.7)', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    const order: string[] = [];
    storageMocks.put.mockImplementation(async (input: PutObjectInput) => {
      order.push('put:start');
      await Promise.resolve();
      order.push('put:end');
      return input.storageKey;
    });
    repoMocks.create.mockImplementation(async (data) => {
      order.push('repo:start');
      await Promise.resolve();
      order.push('repo:end');
      return {
        id: data.id as string,
        ownerId: data.ownerId as string,
        roomId: data.roomId as string,
        mimeType: data.mimeType as string,
        size: data.size as bigint,
        storageKey: data.storageKey as string,
        createdAt: new Date(),
      } satisfies Asset;
    });

    const service = new AssetService(provider, storage, repo);
    const asset = await service.storeAiAsset(
      USER_ID,
      ROOM_ID,
      { bytes: PNG_BYTES, mimeType: 'image/png' },
      'image',
    );

    expect(asset.ownerId).toBe(USER_ID);
    expect(asset.roomId).toBe(ROOM_ID);
    expect(asset.mimeType).toBe('image/png');
    expect(asset.size).toBe(BigInt(PNG_BYTES.byteLength));
    expect(asset.storageKey).toMatch(/^rooms\/.+\/image\/.+\.png$/);
    // Parallel: both started before either ended.
    expect(order.indexOf('put:start')).toBeLessThan(order.indexOf('repo:end'));
    expect(order.indexOf('repo:start')).toBeLessThan(order.indexOf('put:end'));
  });
});

describe('AssetService.listByRoomAndType', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns AssetDTOs with presigned URLs for all assets in room', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findByRoomAndType.mockResolvedValue([
      { id: 'a1', ownerId: USER_ID, roomId: ROOM_ID, mimeType: 'image/png', size: BigInt(4), storageKey: 'rooms/r/image/a.png', createdAt: new Date() },
      { id: 'a2', ownerId: USER_ID, roomId: ROOM_ID, mimeType: 'audio/wav', size: BigInt(8), storageKey: 'rooms/r/audio/b.wav', createdAt: new Date() },
    ]);
    storageMocks.getPresignedUrl.mockResolvedValue('https://signed.example/url');

    const service = new AssetService(provider, storage, repo);
    const dtos = await service.listByRoomAndType(ROOM_ID, 'all');

    expect(dtos).toHaveLength(2);
    expect(dtos[0].id).toBe('a1');
    expect(dtos[0].url).toBe('/api/assets/a1/file');
    expect(dtos[0]).not.toHaveProperty('storageKey');
    expect(repoMocks.findByRoomAndType).toHaveBeenCalledWith(ROOM_ID, '');
  });

  it('passes image/ prefix when type=image', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findByRoomAndType.mockResolvedValue([]);
    storageMocks.getPresignedUrl.mockResolvedValue('https://signed.example/url');

    const service = new AssetService(provider, storage, repo);
    await service.listByRoomAndType(ROOM_ID, 'image');

    expect(repoMocks.findByRoomAndType).toHaveBeenCalledWith(ROOM_ID, 'image/');
  });
});

describe('AssetService.getAssetDTO', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns DTO with presigned URL and never exposes storageKey', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findById.mockResolvedValue({
      id: 'asset-1',
      ownerId: USER_ID,
      roomId: ROOM_ID,
      mimeType: 'image/png',
      size: BigInt(4),
      storageKey: 'rooms/r/image/k.png',
      createdAt: new Date(),
    });
    storageMocks.getPresignedUrl.mockResolvedValue('https://signed.example/r/image/k.png?sig=...');

    const service = new AssetService(provider, storage, repo);
    const dto = await service.getAssetDTO('asset-1');

    expect(dto.id).toBe('asset-1');
    expect(dto.url).toBe('/api/assets/asset-1/file');
    expect(dto.type).toBe('image/png');
    expect(dto).not.toHaveProperty('storageKey');
  });

  it('throws HttpError 404 when asset is missing', async () => {
    const { provider } = makeAi();
    const { storage } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();
    repoMocks.findById.mockResolvedValue(null);

    const service = new AssetService(provider, storage, repo);
    await expect(service.getAssetDTO('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Asset not found',
    });
  });
});

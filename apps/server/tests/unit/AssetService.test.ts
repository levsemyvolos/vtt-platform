import { describe, it, expect, vi, beforeEach, beforeAll, type MockedFunction } from 'vitest';
import { AssetService } from '../../src/services/AssetService.js';
import { _resetKeyCacheForTests } from '../../src/lib/assetUrlSigner.js';

beforeAll(() => {
  if (!process.env['JWT_SECRET']) {
    process.env['JWT_SECRET'] = 'unit-test-secret-' + 'z'.repeat(48);
  }
  _resetKeyCacheForTests();
});
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
  rename: MockedFunction<AssetRepository['rename']>;
}

function makeRepo(): { repo: AssetRepository; mocks: RepoMocksExt } {
  const mocks: RepoMocksExt = {
    findById: vi.fn(),
    create: vi.fn(),
    deleteById: vi.fn(),
    findByRoomAndType: vi.fn(),
    rename: vi.fn(),
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
        originalName: (data.originalName as string | undefined) ?? '',
        createdAt: new Date(),
      } satisfies Asset;
    });

    const service = new AssetService(provider, storage, repo);
    const asset = await service.storeAiAsset(
      USER_ID,
      ROOM_ID,
      { bytes: PNG_BYTES, mimeType: 'image/png' },
      'image',
      'a sleeping dragon',
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

  it('returns AssetDTOs with proxy URLs (never presigned) for all assets in room', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findByRoomAndType.mockResolvedValue([
      { id: 'a1', ownerId: USER_ID, roomId: ROOM_ID, mimeType: 'image/png', size: BigInt(4), storageKey: 'rooms/r/image/a.png', originalName: 'cat.png', createdAt: new Date() },
      { id: 'a2', ownerId: USER_ID, roomId: ROOM_ID, mimeType: 'audio/wav', size: BigInt(8), storageKey: 'rooms/r/audio/b.wav', originalName: 'theme.wav', createdAt: new Date() },
    ]);
    storageMocks.getPresignedUrl.mockResolvedValue('https://signed.example/url');

    const service = new AssetService(provider, storage, repo);
    const dtos = await service.listByRoomAndType(ROOM_ID, 'all');

    expect(dtos).toHaveLength(2);
    expect(dtos[0]!.id).toBe('a1');
    // URL is now signed: /api/assets/a1/file?exp=...&sig=...
    expect(dtos[0]!.url).toMatch(/^\/api\/assets\/a1\/file\?exp=\d+&sig=[A-Za-z0-9_-]+$/);
    expect(dtos[0]!.url).not.toContain('storage.googleapis.com');
    expect(dtos[0]!.name).toBe('cat.png');
    expect(dtos[0]).not.toHaveProperty('storageKey');
    expect(storageMocks.getPresignedUrl).not.toHaveBeenCalled();
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

  it('returns DTO with proxy URL (never a presigned URL) and never exposes storageKey', async () => {
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
      originalName: 'goblin-token.png',
      createdAt: new Date(),
    });
    storageMocks.getPresignedUrl.mockResolvedValue('https://signed.example/r/image/k.png?sig=...');

    const service = new AssetService(provider, storage, repo);
    const dto = await service.getAssetDTO('asset-1');

    expect(dto.id).toBe('asset-1');
    expect(dto.url).toMatch(/^\/api\/assets\/asset-1\/file\?exp=\d+&sig=[A-Za-z0-9_-]+$/);
    expect(dto.url).not.toContain('storage.googleapis.com');
    expect(dto.type).toBe('image/png');
    expect(dto.name).toBe('goblin-token.png');
    expect(dto).not.toHaveProperty('storageKey');
    expect(storageMocks.getPresignedUrl).not.toHaveBeenCalled();
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

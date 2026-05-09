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
        source: (data.source as string | undefined) ?? 'UPLOAD',
        aiPrompt: (data.aiPrompt as string | undefined) ?? null,
        aiModel: (data.aiModel as string | undefined) ?? null,
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
      'gemini-2.5-flash-image',
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
      { id: 'a1', ownerId: USER_ID, roomId: ROOM_ID, mimeType: 'image/png', size: BigInt(4), storageKey: 'rooms/r/image/a.png', originalName: 'cat.png', source: 'UPLOAD', aiPrompt: null, aiModel: null, createdAt: new Date() },
      { id: 'a2', ownerId: USER_ID, roomId: ROOM_ID, mimeType: 'audio/wav', size: BigInt(8), storageKey: 'rooms/r/audio/b.wav', originalName: 'theme.wav', source: 'UPLOAD', aiPrompt: null, aiModel: null, createdAt: new Date() },
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
    expect(repoMocks.findByRoomAndType).toHaveBeenCalledWith(ROOM_ID, '', undefined);
  });

  it('passes image/ prefix when type=image', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findByRoomAndType.mockResolvedValue([]);
    storageMocks.getPresignedUrl.mockResolvedValue('https://signed.example/url');

    const service = new AssetService(provider, storage, repo);
    await service.listByRoomAndType(ROOM_ID, 'image');

    expect(repoMocks.findByRoomAndType).toHaveBeenCalledWith(ROOM_ID, 'image/', undefined);
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
      source: 'UPLOAD',
      aiPrompt: null,
      aiModel: null,
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

describe('AssetService.storeAiAsset (Session 6.3.A — provenance)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes source=AI_IMAGE + aiPrompt + aiModel for image kind', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    storageMocks.put.mockResolvedValue('rooms/r/image/x.png');
    repoMocks.create.mockImplementation(async (data) => ({
      id: data.id as string,
      ownerId: data.ownerId as string,
      roomId: data.roomId as string,
      mimeType: data.mimeType as string,
      size: data.size as bigint,
      storageKey: data.storageKey as string,
      originalName: (data.originalName as string | undefined) ?? '',
      source: (data.source as string | undefined) ?? 'UPLOAD',
      aiPrompt: (data.aiPrompt as string | undefined) ?? null,
      aiModel: (data.aiModel as string | undefined) ?? null,
      createdAt: new Date(),
    }));

    const service = new AssetService(provider, storage, repo);
    await service.storeAiAsset(
      USER_ID, ROOM_ID,
      { bytes: Buffer.from('test'), mimeType: 'image/png' },
      'image',
      'Опиши таверника',
      'gemini-2.5-flash-image',
    );
    const createCall = (repoMocks.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createCall.source).toBe('AI_IMAGE');
    expect(createCall.aiPrompt).toBe('Опиши таверника');
    expect(createCall.aiModel).toBe('gemini-2.5-flash-image');
  });

  it('writes source=AI_AUDIO for audio kind', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    storageMocks.put.mockResolvedValue('rooms/r/audio/x.wav');
    repoMocks.create.mockImplementation(async (data) => ({
      id: data.id as string,
      ownerId: data.ownerId as string,
      roomId: data.roomId as string,
      mimeType: data.mimeType as string,
      size: data.size as bigint,
      storageKey: data.storageKey as string,
      originalName: (data.originalName as string | undefined) ?? '',
      source: (data.source as string | undefined) ?? 'UPLOAD',
      aiPrompt: (data.aiPrompt as string | undefined) ?? null,
      aiModel: (data.aiModel as string | undefined) ?? null,
      createdAt: new Date(),
    }));

    const service = new AssetService(provider, storage, repo);
    await service.storeAiAsset(
      USER_ID, ROOM_ID,
      { bytes: Buffer.from('test'), mimeType: 'audio/wav' },
      'audio',
      'epic battle music',
      'lyria-002',
    );
    const createCall = (repoMocks.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createCall.source).toBe('AI_AUDIO');
    expect(createCall.aiModel).toBe('lyria-002');
  });

  it('listByRoomAndType passes source filter through to repo', async () => {
    const { provider } = makeAi();
    const { storage } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findByRoomAndType.mockResolvedValue([]);

    const service = new AssetService(provider, storage, repo);
    await service.listByRoomAndType(ROOM_ID, 'image', 'ai');
    expect(repoMocks.findByRoomAndType).toHaveBeenCalledWith(ROOM_ID, 'image/', 'ai');
  });

  it('listByRoomAndType without source filters by mime only', async () => {
    const { provider } = makeAi();
    const { storage } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    repoMocks.findByRoomAndType.mockResolvedValue([]);

    const service = new AssetService(provider, storage, repo);
    await service.listByRoomAndType(ROOM_ID, 'image');
    expect(repoMocks.findByRoomAndType).toHaveBeenCalledWith(ROOM_ID, 'image/', undefined);
  });

  // S5.5 P1 — opts.displayName overrides "AI: <prompt>" default so music
  // history shows a readable mood-derived title rather than the full
  // 8-line Lyria prompt.
  it('storeAiAsset uses opts.displayName when provided (S5.5 P1)', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    storageMocks.put.mockResolvedValue('rooms/r/audio/x.mp3');
    repoMocks.create.mockImplementation(async (data) => ({
      id: data.id as string,
      ownerId: data.ownerId as string,
      roomId: data.roomId as string,
      mimeType: data.mimeType as string,
      size: data.size as bigint,
      storageKey: data.storageKey as string,
      originalName: (data.originalName as string | undefined) ?? '',
      source: (data.source as string | undefined) ?? 'UPLOAD',
      aiPrompt: (data.aiPrompt as string | undefined) ?? null,
      aiModel: (data.aiModel as string | undefined) ?? null,
      createdAt: new Date(),
    }));

    const service = new AssetService(provider, storage, repo);
    await service.storeAiAsset(
      USER_ID, ROOM_ID,
      { bytes: Buffer.from('mp3'), mimeType: 'audio/mpeg' },
      'audio',
      'Mood: eerie...\nInstrumentation: drones...\nHard constraints: ...',
      'lyria-3-clip-preview',
      { displayName: 'Eerie Tense' },
    );
    const createCall = (repoMocks.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createCall.originalName).toBe('Eerie Tense');
    // composedPrompt still recorded under aiPrompt for provenance
    expect(createCall.aiPrompt).toContain('Mood: eerie');
  });

  it('storeAiAsset falls back to "AI: <prompt>" when displayName is empty/missing', async () => {
    const { provider } = makeAi();
    const { storage, mocks: storageMocks } = makeStorage();
    const { repo, mocks: repoMocks } = makeRepo();

    storageMocks.put.mockResolvedValue('rooms/r/image/x.png');
    repoMocks.create.mockImplementation(async (data) => ({
      id: data.id as string,
      ownerId: data.ownerId as string,
      roomId: data.roomId as string,
      mimeType: data.mimeType as string,
      size: data.size as bigint,
      storageKey: data.storageKey as string,
      originalName: (data.originalName as string | undefined) ?? '',
      source: (data.source as string | undefined) ?? 'UPLOAD',
      aiPrompt: (data.aiPrompt as string | undefined) ?? null,
      aiModel: (data.aiModel as string | undefined) ?? null,
      createdAt: new Date(),
    }));

    const service = new AssetService(provider, storage, repo);
    await service.storeAiAsset(
      USER_ID, ROOM_ID,
      { bytes: Buffer.from('png'), mimeType: 'image/png' },
      'image',
      'red dragon over a castle',
      'gemini-3.1-flash-image-preview',
      { displayName: '   ' }, // whitespace-only → fallback
    );
    const createCall = (repoMocks.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createCall.originalName).toBe('AI: red dragon over a castle');
  });
});

/**
 * Asset upload endpoints — integration tests (Wave 6.4.1).
 *
 * Tests AssetService.initUpload() and AssetService.finalizeUpload()
 * using stub repos and a stub FileStorageAdapter — no real GCS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetService } from '../../src/services/AssetService.js';
import type { AssetRepository } from '../../src/repositories/AssetRepository.js';
import type { FileStorageAdapter } from '../../src/infrastructure/storage/FileStorageAdapter.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../../src/lib/errors.js';

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OUTSIDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeStorageAdapter(fileExists = true): FileStorageAdapter {
  return {
    put: vi.fn().mockResolvedValue('key'),
    getPresignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-get'),
    getPresignedUploadUrl: vi.fn().mockResolvedValue({
      uploadUrl: 'https://storage.googleapis.com/signed-put',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }),
    statObject: vi.fn().mockResolvedValue(fileExists ? { size: 1024, contentType: 'image/png' } : null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAssetRepo(): AssetRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date() })),
    deleteById: vi.fn().mockResolvedValue(undefined),
    findByRoomAndType: vi.fn().mockResolvedValue([]),
  } as unknown as AssetRepository;
}

function makeAiProvider(): AIProvider {
  return {} as AIProvider;
}

function makePrismaDb(ownerId: string, memberIds: string[]): PrismaClient {
  return {
    room: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === ROOM_ID) return Promise.resolve({ ownerId });
        return Promise.resolve(null);
      }),
    },
    roomMember: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { roomId: string; userId: string } }) => {
        if (memberIds.includes(where.userId)) return Promise.resolve({ id: 'member-row' });
        return Promise.resolve(null);
      }),
    },
  } as unknown as PrismaClient;
}

// ─────────────────────────────────────────────────────────────
// initUpload tests
// ─────────────────────────────────────────────────────────────

describe('AssetService.initUpload', () => {
  let service: AssetService;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    storage = makeStorageAdapter();
    const db = makePrismaDb(OWNER_ID, [MEMBER_ID]);
    service = new AssetService(makeAiProvider(), storage, makeAssetRepo(), db);
  });

  it('room owner receives uploadUrl and storageKey', async () => {
    const result = await service.initUpload(
      { roomId: ROOM_ID, mimeType: 'image/png', size: 1024 },
      OWNER_ID,
    );
    expect(result.uploadUrl).toBe('https://storage.googleapis.com/signed-put');
    expect(result.storageKey).toMatch(new RegExp(`^rooms/${ROOM_ID}/image/`));
    expect(result.expiresAt).toBeTruthy();
  });

  it('room member receives uploadUrl', async () => {
    const result = await service.initUpload(
      { roomId: ROOM_ID, mimeType: 'image/jpeg', size: 512 },
      MEMBER_ID,
    );
    expect(result.uploadUrl).toBeTruthy();
  });

  it('outsider gets 403', async () => {
    await expect(
      service.initUpload({ roomId: ROOM_ID, mimeType: 'image/png', size: 100 }, OUTSIDER_ID),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('non-existent room gets 404', async () => {
    await expect(
      service.initUpload({ roomId: '00000000-0000-0000-0000-000000000000', mimeType: 'image/png', size: 100 }, OWNER_ID),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────
// finalizeUpload tests
// ─────────────────────────────────────────────────────────────

describe('AssetService.finalizeUpload', () => {
  let service: AssetService;
  let storage: FileStorageAdapter;
  let repo: AssetRepository;

  beforeEach(() => {
    storage = makeStorageAdapter(true);
    repo = makeAssetRepo();
    const db = makePrismaDb(OWNER_ID, [MEMBER_ID]);
    service = new AssetService(makeAiProvider(), storage, repo, db);
  });

  it('owner finalizes successfully, asset created', async () => {
    const dto = await service.finalizeUpload(
      {
        roomId: ROOM_ID,
        storageKey: `rooms/${ROOM_ID}/image/test.png`,
        mimeType: 'image/png',
        size: 1024,
      },
      OWNER_ID,
    );
    expect(dto.url).toBe('https://example.com/signed-get');
    expect(dto.roomId).toBe(ROOM_ID);
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('outsider gets 403', async () => {
    await expect(
      service.finalizeUpload(
        { roomId: ROOM_ID, storageKey: `rooms/${ROOM_ID}/image/x.png`, mimeType: 'image/png', size: 100 },
        OUTSIDER_ID,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('storageKey mismatch with roomId → 400', async () => {
    await expect(
      service.finalizeUpload(
        { roomId: ROOM_ID, storageKey: 'rooms/other-room/image/x.png', mimeType: 'image/png', size: 100 },
        OWNER_ID,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('file not in storage → 400', async () => {
    (storage.statObject as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      service.finalizeUpload(
        { roomId: ROOM_ID, storageKey: `rooms/${ROOM_ID}/image/missing.png`, mimeType: 'image/png', size: 100 },
        OWNER_ID,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

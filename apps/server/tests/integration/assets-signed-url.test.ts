/**
 * GET /api/assets/:id/file with HMAC-signed URL — integration tests.
 *
 * Verifies that the GET endpoint:
 *   - accepts a freshly signed URL and streams bytes (200)
 *   - rejects missing query params (403)
 *   - rejects tampered signature (403)
 *   - rejects expired exp (403)
 *   - sets cache + privacy headers on success
 *
 * The endpoint MUST NOT require Authorization — the signature IS the capability.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Readable } from 'stream';
import type { PrismaClient } from '@prisma/client';
import { buildAssetsRouter } from '../../src/routes/assets.js';
import { AssetService } from '../../src/services/AssetService.js';
import type { AssetRepository } from '../../src/repositories/AssetRepository.js';
import type { FileStorageAdapter } from '../../src/infrastructure/storage/FileStorageAdapter.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';
import { signAssetUrl, _resetKeyCacheForTests } from '../../src/lib/assetUrlSigner.js';

const ASSET_ID = '11111111-1111-1111-1111-111111111111';
const ROOM_ID = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeAll(() => {
  process.env['JWT_SECRET'] = 'integ-signed-url-' + 'k'.repeat(48);
  _resetKeyCacheForTests();
});

function makeStorage(): FileStorageAdapter {
  return {
    put: vi.fn().mockResolvedValue('key'),
    getPresignedUrl: vi.fn(),
    getPresignedUploadUrl: vi.fn(),
    statObject: vi.fn().mockResolvedValue({ size: 16, contentType: 'image/png' }),
    delete: vi.fn(),
    createReadStream: vi.fn().mockReturnValue(Readable.from(Buffer.from('PNG-fake-bytes-x'))),
  };
}

function makeRepo(): AssetRepository {
  return {
    findById: vi.fn().mockResolvedValue({
      id: ASSET_ID,
      ownerId: OWNER_ID,
      roomId: ROOM_ID,
      mimeType: 'image/png',
      size: BigInt(16),
      storageKey: `rooms/${ROOM_ID}/image/foo.png`,
      originalName: 'foo.png',
      createdAt: new Date(),
    }),
    create: vi.fn(),
    deleteById: vi.fn(),
    findByRoomAndType: vi.fn().mockResolvedValue([]),
    rename: vi.fn(),
  } as unknown as AssetRepository;
}

function makeApp(): express.Express {
  const service = new AssetService({} as AIProvider, makeStorage(), makeRepo());
  const db = {} as PrismaClient;
  const app = express();
  app.use('/api/assets', buildAssetsRouter(service, db));
  return app;
}

describe('GET /api/assets/:id/file — signed URL', () => {
  it('200 with valid signature; sets immutable cache + privacy headers', async () => {
    const app = makeApp();
    const { url } = signAssetUrl(ASSET_ID);
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
  });

  it('403 without query params', async () => {
    const app = makeApp();
    const res = await request(app).get(`/api/assets/${ASSET_ID}/file`);
    expect(res.status).toBe(403);
  });

  it('403 with tampered signature', async () => {
    const app = makeApp();
    const { url } = signAssetUrl(ASSET_ID);
    const tampered = url.slice(0, -1) + (url.endsWith('A') ? 'B' : 'A');
    const res = await request(app).get(tampered);
    expect(res.status).toBe(403);
  });

  it('403 with expired exp', async () => {
    const app = makeApp();
    const { url } = signAssetUrl(ASSET_ID);
    const params = new URL('http://h' + url).searchParams;
    const expired = `/api/assets/${ASSET_ID}/file?exp=1&sig=${encodeURIComponent(params.get('sig')!)}`;
    const res = await request(app).get(expired);
    expect(res.status).toBe(403);
  });

  it('403 when signature was issued for a different assetId', async () => {
    const app = makeApp();
    const { url } = signAssetUrl('99999999-9999-9999-9999-999999999999');
    // Replace assetId in path; sig was bound to the other one.
    const swapped = url.replace('99999999-9999-9999-9999-999999999999', ASSET_ID);
    const res = await request(app).get(swapped);
    expect(res.status).toBe(403);
  });
});

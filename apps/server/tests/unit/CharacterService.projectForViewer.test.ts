import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@prisma/client';
import { CharacterService } from '../../src/services/CharacterService.js';
import type { CharacterRepository, CharacterWithPdf } from '../../src/repositories/CharacterRepository.js';
import type { FileStorageAdapter } from '../../src/infrastructure/storage/FileStorageAdapter.js';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PLAYER_ID = '22222222-2222-2222-2222-222222222222';
const GM_ID = '33333333-3333-3333-3333-333333333333';
const ROOM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeCharacter(overrides: Partial<CharacterWithPdf> = {}): CharacterWithPdf {
  return {
    id: 'char-1',
    ownerId: OWNER_ID,
    roomId: ROOM_ID,
    name: 'Aelar',
    sheetData: { class: 'Wizard', level: 5, hp: 28 },
    pdfAssetId: null,
    updatedAt: new Date('2026-04-30T12:00:00Z'),
    pdfAsset: null,
    ...overrides,
  };
}

function makeAsset(): Asset {
  return {
    id: 'asset-1',
    ownerId: OWNER_ID,
    roomId: ROOM_ID,
    mimeType: 'application/pdf',
    size: BigInt(1024),
    storageKey: 'rooms/r/doc/sheet.pdf',
    createdAt: new Date(),
  };
}

function makeRepo(): CharacterRepository {
  return {
    findById: vi.fn(),
    listByRoom: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setPdfAssetId: vi.fn(),
  } as unknown as CharacterRepository;
}

function makeStorage(presigned = 'https://signed.example/sheet.pdf'): FileStorageAdapter {
  return {
    put: vi.fn(),
    getPresignedUrl: vi.fn().mockResolvedValue(presigned),
    delete: vi.fn(),
  };
}

describe('CharacterService.projectForViewer (algorithm A6 RBAC, §2.17.6)', () => {
  it('GM viewer + own character → full DTO with sheetData', async () => {
    const svc = new CharacterService(makeRepo(), makeStorage(), null);
    const char = makeCharacter({ ownerId: GM_ID });
    const dto = await svc.projectForViewer(char, 'GM', GM_ID);
    expect(dto.kind).toBe('full');
    if (dto.kind === 'full') {
      expect(dto.sheetData).toEqual({ class: 'Wizard', level: 5, hp: 28 });
      expect(dto.ownerId).toBe(GM_ID);
    }
  });

  it("GM viewer + other player's character → full DTO (Ф9.1.3)", async () => {
    const svc = new CharacterService(makeRepo(), makeStorage(), null);
    const char = makeCharacter();
    const dto = await svc.projectForViewer(char, 'GM', GM_ID);
    expect(dto.kind).toBe('full');
    if (dto.kind === 'full') {
      expect(dto.ownerId).toBe(OWNER_ID);
      expect(dto.sheetData).toBeDefined();
    }
  });

  it('Owner Player viewer + own character → full DTO', async () => {
    const svc = new CharacterService(makeRepo(), makeStorage(), null);
    const char = makeCharacter();
    const dto = await svc.projectForViewer(char, 'Player', OWNER_ID);
    expect(dto.kind).toBe('full');
  });

  it('Other Player viewer + other character → short DTO without sheetData', async () => {
    const svc = new CharacterService(makeRepo(), makeStorage(), null);
    const char = makeCharacter();
    const dto = await svc.projectForViewer(char, 'Player', OTHER_PLAYER_ID);
    expect(dto.kind).toBe('short');
    expect(Object.keys(dto)).not.toContain('sheetData');
    expect(Object.keys(dto)).not.toContain('pdfUrl');
  });

  it('Observer viewer + any character → short DTO without sheetData', async () => {
    const svc = new CharacterService(makeRepo(), makeStorage(), null);
    const char = makeCharacter();
    const dto = await svc.projectForViewer(char, 'Observer', 'anybody');
    expect(dto.kind).toBe('short');
    expect(Object.keys(dto)).not.toContain('sheetData');
  });

  it('Character with PDF: full includes pdfUrl, short never includes it', async () => {
    const storage = makeStorage('https://signed.example/sheet.pdf?sig=ok');
    const svc = new CharacterService(makeRepo(), storage, null);
    const char = makeCharacter({ pdfAssetId: 'asset-1', pdfAsset: makeAsset() });

    const fullDto = await svc.projectForViewer(char, 'GM', GM_ID);
    expect(fullDto.kind).toBe('full');
    if (fullDto.kind === 'full') {
      expect(fullDto.pdfUrl).toBe('https://signed.example/sheet.pdf?sig=ok');
    }

    const shortDto = await svc.projectForViewer(char, 'Player', OTHER_PLAYER_ID);
    expect(shortDto.kind).toBe('short');
    expect(Object.keys(shortDto)).not.toContain('pdfUrl');
  });
});

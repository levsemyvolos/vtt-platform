import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandoutService } from '../../src/services/HandoutService.js';
import type {
  HandoutRepository,
  HandoutWithRecipientsAndAsset,
} from '../../src/repositories/HandoutRepository.js';
import type { FileStorageAdapter } from '../../src/infrastructure/storage/FileStorageAdapter.js';

const ROOM_ID = 'room-1';
const PLAYER_ID = 'p1';
const OTHER_PLAYER_ID = 'p2';

function makeHandout(
  overrides: Partial<HandoutWithRecipientsAndAsset> = {},
): HandoutWithRecipientsAndAsset {
  return {
    id: 'h1',
    roomId: ROOM_ID,
    title: 'Map fragment',
    body: 'A torn piece of parchment...',
    assetId: null,
    createdAt: new Date('2026-04-30T10:00:00Z'),
    recipients: [],
    asset: null,
    ...overrides,
  };
}

function makeRepo(): HandoutRepository {
  return {
    findById: vi.fn(),
    listByRoom: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn(),
    grantTo: vi.fn(),
    revokeFrom: vi.fn(),
    listGrantedToUser: vi.fn().mockResolvedValue([]),
  } as unknown as HandoutRepository;
}

function makeStorage(): FileStorageAdapter {
  return {
    put: vi.fn(),
    getPresignedUrl: vi.fn().mockResolvedValue('https://signed.example/handout.png'),
    delete: vi.fn(),
  };
}

describe('HandoutService (Ф7.2 — RBAC)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createHandout as Player → throws 403', async () => {
    const svc = new HandoutService(makeRepo(), makeStorage());
    await expect(
      svc.createHandout(ROOM_ID, 'Player', { title: 't', body: 'b' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('createHandout as GM → returns DTO', async () => {
    const repo = makeRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHandout({ title: 'New', body: 'Body' }),
    );
    const svc = new HandoutService(repo, makeStorage());
    const dto = await svc.createHandout(ROOM_ID, 'GM', { title: 'New', body: 'Body' });
    expect(dto.title).toBe('New');
    expect(dto.recipientIds).toEqual([]);
  });

  it('grantToPlayers as Player → throws 403', async () => {
    const svc = new HandoutService(makeRepo(), makeStorage());
    await expect(
      svc.grantToPlayers('h1', 'Player', [OTHER_PLAYER_ID]),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('revokeFromPlayer as GM removes the recipient', async () => {
    const repo = makeRepo();
    (repo.revokeFrom as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHandout({ recipients: [] }),
    );
    const svc = new HandoutService(repo, makeStorage());
    const dto = await svc.revokeFromPlayer('h1', 'GM', PLAYER_ID);
    expect(repo.revokeFrom).toHaveBeenCalledWith('h1', PLAYER_ID);
    expect(dto.recipientIds).toEqual([]);
  });

  it('listForViewer as Player → returns only granted handouts', async () => {
    const repo = makeRepo();
    const granted = makeHandout({
      id: 'h-granted',
      recipients: [
        { handoutId: 'h-granted', userId: PLAYER_ID, grantedAt: new Date() },
      ],
    });
    (repo.listGrantedToUser as ReturnType<typeof vi.fn>).mockResolvedValue([granted]);
    const svc = new HandoutService(repo, makeStorage());
    const list = await svc.listForViewer(ROOM_ID, 'Player', PLAYER_ID);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('h-granted');
    expect(repo.listByRoom).not.toHaveBeenCalled();
    expect(repo.listGrantedToUser).toHaveBeenCalledWith(ROOM_ID, PLAYER_ID);
  });

  it('listForViewer as Observer → empty list (Ф7.2 excludes observers)', async () => {
    const svc = new HandoutService(makeRepo(), makeStorage());
    const list = await svc.listForViewer(ROOM_ID, 'Observer', 'obs-1');
    expect(list).toEqual([]);
  });

  it('projects assetUrl via storage when asset is attached', async () => {
    const repo = makeRepo();
    const handoutWithAsset = makeHandout({
      assetId: 'asset-1',
      asset: {
        id: 'asset-1',
        ownerId: 'gm-1',
        roomId: ROOM_ID,
        mimeType: 'image/png',
        size: BigInt(100),
        storageKey: 'rooms/r/image/x.png',
        originalName: 'x.png',
        createdAt: new Date(),
      },
    });
    (repo.listByRoom as ReturnType<typeof vi.fn>).mockResolvedValue([handoutWithAsset]);
    const svc = new HandoutService(repo, makeStorage());
    const list = await svc.listForViewer(ROOM_ID, 'GM', 'gm-1');
    expect(list[0]?.assetUrl).toMatch(/^\/api\/assets\/asset-1\/file\?exp=\d+&sig=[A-Za-z0-9_-]+$/);
    expect(list[0]?.assetUrl).not.toContain('storage.googleapis.com');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JournalEntry, JournalRecipient, Asset } from '@prisma/client';
import { JournalService } from '../../src/services/JournalService.js';
import type {
  JournalRepository,
  JournalEntryWithRelations,
} from '../../src/repositories/JournalRepository.js';

// ─── UUIDs ───────────────────────────────────────────────────────────────────

const ROOM_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AUTHOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GM_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_ID  = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ENTRY_ID  = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<JournalEntryWithRelations> = {}): JournalEntryWithRelations {
  const base: JournalEntry = {
    id: ENTRY_ID,
    roomId: ROOM_ID,
    authorId: AUTHOR_ID,
    title: 'Session Notes',
    body: 'We fought a goblin.',
    visibility: 'private',
    assetId: null,
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:00:00Z'),
  };
  return {
    ...base,
    recipients: [] as JournalRecipient[],
    asset: null as Asset | null,
    ...overrides,
  };
}

function makeRecipient(userId: string): JournalRecipient {
  return {
    entryId: ENTRY_ID,
    userId,
    grantedAt: new Date(),
  };
}

function makeRepo(initial: JournalEntryWithRelations | null = null): JournalRepository {
  let stored = initial;
  return {
    findById: vi.fn(async (_id: string) => stored),
    listByRoom: vi.fn(async (_roomId: string) => (stored ? [stored] : [])),
    create: vi.fn(async (data) => {
      const entry = makeEntry({
        id: (data as { id?: string }).id ?? ENTRY_ID,
        roomId: (data as { roomId?: string }).roomId ?? ROOM_ID,
        authorId: (data as { authorId?: string }).authorId ?? AUTHOR_ID,
        title: (data as { title?: string }).title ?? 'Title',
        body: (data as { body?: string }).body ?? '',
        visibility: ((data as { visibility?: string }).visibility ?? 'private') as JournalEntry['visibility'],
        assetId: (data as { assetId?: string | null }).assetId ?? null,
        recipients: [],
        asset: null,
      });
      stored = entry;
      return entry;
    }),
    update: vi.fn(async (_id, data) => {
      if (!stored) throw new Error('no stored entry');
      const patchedVisibility = (data as { visibility?: string }).visibility;
      stored = {
        ...stored,
        ...(typeof (data as { title?: string }).title === 'string' ? { title: (data as { title: string }).title } : {}),
        ...(typeof (data as { body?: string }).body === 'string' ? { body: (data as { body: string }).body } : {}),
        ...((data as { assetId?: unknown }).assetId !== undefined ? { assetId: (data as { assetId: string | null }).assetId } : {}),
        ...(patchedVisibility !== undefined ? { visibility: patchedVisibility as JournalEntry['visibility'] } : {}),
        updatedAt: new Date(),
      };
      return stored;
    }),
    deleteById: vi.fn(async (_id: string) => {
      stored = null;
    }),
    setRecipients: vi.fn(async (_entryId: string, userIds: string[]) => {
      if (!stored) return;
      stored = {
        ...stored,
        recipients: userIds.map(makeRecipient),
      };
    }),
  } as unknown as JournalRepository;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('JournalService', () => {
  let repo: JournalRepository;
  let service: JournalService;

  beforeEach(() => {
    repo = makeRepo();
    service = new JournalService(repo);
  });

  // ── create ────────────────────────────────────────────────────────────────

  it('create: GM creates entry → visibility=private, recipientIds=[]', async () => {
    const entry = await service.create(ROOM_ID, GM_ID, { title: 'Lore', body: 'Once upon...' });
    expect(entry.visibility).toBe('private');
    expect(entry.recipients).toHaveLength(0);
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('create: Player creates entry → visibility=private', async () => {
    const entry = await service.create(ROOM_ID, PLAYER_ID, { title: 'Diary', body: 'Day 1' });
    expect(entry.visibility).toBe('private');
    expect(entry.authorId).toBe(PLAYER_ID);
  });

  // ── update ────────────────────────────────────────────────────────────────

  it('update: non-author non-GM → 403', async () => {
    repo = makeRepo(makeEntry({ authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    await expect(
      service.update(ENTRY_ID, OTHER_ID, 'Player', { title: 'Hacked' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('update: author updates own entry → ok', async () => {
    repo = makeRepo(makeEntry({ authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    const result = await service.update(ENTRY_ID, AUTHOR_ID, 'Player', { title: 'New Title' });
    expect(result.title).toBe('New Title');
  });

  it('update: GM updates non-author entry → ok', async () => {
    repo = makeRepo(makeEntry({ authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    const result = await service.update(ENTRY_ID, GM_ID, 'GM', { body: 'GM amended.' });
    expect(result.body).toBe('GM amended.');
  });

  it('update: missing entry → 404', async () => {
    repo = makeRepo(null);
    service = new JournalService(repo);
    await expect(
      service.update(ENTRY_ID, GM_ID, 'GM', { title: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  // ── grant ─────────────────────────────────────────────────────────────────

  it('grant: GM grants 2 users → visibility=shared, recipientIds populated', async () => {
    repo = makeRepo(makeEntry());
    service = new JournalService(repo);
    const result = await service.grant(ENTRY_ID, [PLAYER_ID, OTHER_ID], 'GM');
    expect(result.visibility).toBe('shared');
    expect(result.recipients.map((r) => r.userId)).toEqual(
      expect.arrayContaining([PLAYER_ID, OTHER_ID]),
    );
  });

  it('grant: GM revoke (grant []) → visibility=private, recipientIds=[]', async () => {
    const initial = makeEntry({
      visibility: 'shared',
      recipients: [makeRecipient(PLAYER_ID)],
    });
    repo = makeRepo(initial);
    service = new JournalService(repo);
    const result = await service.grant(ENTRY_ID, [], 'GM');
    expect(result.visibility).toBe('private');
    expect(result.recipients).toHaveLength(0);
  });

  it('grant: Player tries to grant → 403', async () => {
    repo = makeRepo(makeEntry());
    service = new JournalService(repo);
    await expect(
      service.grant(ENTRY_ID, [PLAYER_ID], 'Player'),
    ).rejects.toMatchObject({ status: 403 });
  });

  // ── listForViewer ─────────────────────────────────────────────────────────

  it('listForViewer: Player with shared+granted → sees entry', async () => {
    repo = makeRepo(
      makeEntry({
        visibility: 'shared',
        recipients: [makeRecipient(PLAYER_ID)],
      }),
    );
    service = new JournalService(repo);
    const list = await service.listForViewer(ROOM_ID, PLAYER_ID, 'Player');
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(ENTRY_ID);
  });

  it('listForViewer: Player with shared+NOT granted → does not see entry', async () => {
    repo = makeRepo(
      makeEntry({
        visibility: 'shared',
        recipients: [makeRecipient(OTHER_ID)], // PLAYER_ID not in list
      }),
    );
    service = new JournalService(repo);
    const list = await service.listForViewer(ROOM_ID, PLAYER_ID, 'Player');
    expect(list).toHaveLength(0);
  });

  it('listForViewer: Player with private entry not own → does not see', async () => {
    repo = makeRepo(makeEntry({ visibility: 'private', authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    const list = await service.listForViewer(ROOM_ID, PLAYER_ID, 'Player');
    expect(list).toHaveLength(0);
  });

  it('listForViewer: Author with private own entry → sees entry', async () => {
    repo = makeRepo(makeEntry({ visibility: 'private', authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    const list = await service.listForViewer(ROOM_ID, AUTHOR_ID, 'Player');
    expect(list).toHaveLength(1);
  });

  it('listForViewer: GM sees all entries regardless of visibility', async () => {
    repo = makeRepo(makeEntry({ visibility: 'private', authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    const list = await service.listForViewer(ROOM_ID, GM_ID, 'GM');
    expect(list).toHaveLength(1);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('delete: author deletes own entry → returns deleted entry', async () => {
    const initial = makeEntry({ authorId: AUTHOR_ID });
    repo = makeRepo(initial);
    service = new JournalService(repo);
    const result = await service.delete(ENTRY_ID, AUTHOR_ID, 'Player');
    expect(result.id).toBe(ENTRY_ID);
    expect(repo.deleteById).toHaveBeenCalledWith(ENTRY_ID);
  });

  it('delete: non-author Player → 403', async () => {
    repo = makeRepo(makeEntry({ authorId: AUTHOR_ID }));
    service = new JournalService(repo);
    await expect(
      service.delete(ENTRY_ID, OTHER_ID, 'Player'),
    ).rejects.toMatchObject({ status: 403 });
  });

  // ── projectForViewer ──────────────────────────────────────────────────────

  it('projectForViewer: no asset → no assetUrl/assetMime fields', () => {
    const entry = makeEntry({ asset: null });
    service = new JournalService(repo);
    const dto = service.projectForViewer(entry);
    expect(dto.assetUrl).toBeUndefined();
    expect(dto.assetMime).toBeUndefined();
  });

  it('projectForViewer: with asset → assetUrl and assetMime populated', () => {
    const assetId = '00000000-0000-0000-0000-000000000001';
    const entry = makeEntry({
      asset: {
        id: assetId,
        mimeType: 'image/png',
        ownerId: GM_ID,
        roomId: ROOM_ID,
        size: BigInt(1024),
        storageKey: 'rooms/r/img/cover.png',
        originalName: 'cover.png',
        createdAt: new Date(),
      },
    });
    service = new JournalService(repo);
    const dto = service.projectForViewer(entry);
    expect(dto.assetUrl).toContain(assetId);
    expect(dto.assetMime).toBe('image/png');
  });
});

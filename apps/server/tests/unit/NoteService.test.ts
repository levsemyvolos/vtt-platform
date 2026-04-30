import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Note } from '@prisma/client';
import { NoteService } from '../../src/services/NoteService.js';
import type { NoteRepository } from '../../src/repositories/NoteRepository.js';

const ROOM_ID = 'room-1';
const AUTHOR_ID = 'gm-author';
const OTHER_GM_ID = 'gm-other';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    roomId: ROOM_ID,
    authorId: AUTHOR_ID,
    title: 'Plot twist',
    body: 'The barkeep is the lich.',
    updatedAt: new Date('2026-04-30T11:00:00Z'),
    ...overrides,
  };
}

function makeRepo(): NoteRepository {
  return {
    findById: vi.fn(),
    listByRoomAndAuthor: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as NoteRepository;
}

describe('NoteService (Ф7.1 — author-only access)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create as Player → throws 403', async () => {
    const svc = new NoteService(makeRepo());
    await expect(
      svc.create(ROOM_ID, 'Player', AUTHOR_ID, { title: 't', body: 'b' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('getById as a different GM (not the author) → throws 403', async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeNote());
    const svc = new NoteService(repo);
    await expect(svc.getById('n1', OTHER_GM_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('getById as the author → returns DTO', async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeNote());
    const svc = new NoteService(repo);
    const dto = await svc.getById('n1', AUTHOR_ID);
    expect(dto.id).toBe('n1');
    expect(dto.authorId).toBe(AUTHOR_ID);
  });

  it('update as non-author → throws 403', async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeNote());
    const svc = new NoteService(repo);
    await expect(
      svc.update('n1', OTHER_GM_ID, { title: 'edited' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('create as GM → persists and returns DTO', async () => {
    const repo = makeRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeNote({ title: 'Fresh', body: 'note' }),
    );
    const svc = new NoteService(repo);
    const dto = await svc.create(ROOM_ID, 'GM', AUTHOR_ID, {
      title: 'Fresh',
      body: 'note',
    });
    expect(dto.title).toBe('Fresh');
    expect(dto.authorId).toBe(AUTHOR_ID);
  });
});

import type { PrismaClient, Prisma, Note } from '@prisma/client';

/**
 * Persistence for Ф7.1 — приватні нотатки GM.
 * Authorisation (only the author may read / update / delete) is enforced in
 * NoteService, not here.
 */
export class NoteRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<Note | null> {
    return this.db.note.findUnique({ where: { id } });
  }

  listByRoomAndAuthor(roomId: string, authorId: string): Promise<Note[]> {
    return this.db.note.findMany({
      where: { roomId, authorId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.NoteUncheckedCreateInput): Promise<Note> {
    return this.db.note.create({ data });
  }

  update(id: string, data: Prisma.NoteUpdateInput): Promise<Note> {
    return this.db.note.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.db.note.delete({ where: { id } });
  }
}

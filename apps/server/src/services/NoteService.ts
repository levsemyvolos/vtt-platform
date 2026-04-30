import { randomUUID } from 'crypto';
import type { Note } from '@prisma/client';
import type {
  NoteDTO,
  NoteCreateRequest,
  NoteUpdateRequest,
  Role,
} from '@vtt/shared';
import type { NoteRepository } from '../repositories/NoteRepository.js';
import { HttpError } from '../lib/errors.js';

/**
 * Private GM notes service (Ф7.1).
 *
 * Strict authorship invariant: only the **author** may read or modify a
 * note. A different GM in the same room is treated as an unrelated viewer
 * and receives 403 — notes are personal, not role-shared.
 *
 * Creation is gated to GM-role authors per Ф7.1.3.
 */
export class NoteService {
  constructor(private readonly noteRepo: NoteRepository) {}

  async create(
    roomId: string,
    authorRole: Role,
    authorId: string,
    dto: NoteCreateRequest,
  ): Promise<NoteDTO> {
    if (authorRole !== 'GM') {
      throw new HttpError(403, 'Only GM can create private notes');
    }
    const created = await this.noteRepo.create({
      id: randomUUID(),
      roomId,
      authorId,
      title: dto.title,
      body: dto.body,
    });
    return this.toDTO(created);
  }

  /**
   * Strict author-only access (Ф7.1). 403 even if the viewer is GM but not
   * the original author.
   */
  async getById(noteId: string, viewerId: string): Promise<NoteDTO> {
    const note = await this.requireOwn(noteId, viewerId);
    return this.toDTO(note);
  }

  async update(
    noteId: string,
    viewerId: string,
    dto: NoteUpdateRequest,
  ): Promise<NoteDTO> {
    await this.requireOwn(noteId, viewerId);
    const data: { title?: string; body?: string } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    const updated = await this.noteRepo.update(noteId, data);
    return this.toDTO(updated);
  }

  async delete(noteId: string, viewerId: string): Promise<void> {
    await this.requireOwn(noteId, viewerId);
    await this.noteRepo.delete(noteId);
  }

  async listForAuthor(roomId: string, authorId: string): Promise<NoteDTO[]> {
    const rows = await this.noteRepo.listByRoomAndAuthor(roomId, authorId);
    return rows.map((r) => this.toDTO(r));
  }

  private async requireOwn(noteId: string, viewerId: string): Promise<Note> {
    const note = await this.noteRepo.findById(noteId);
    if (!note) throw new HttpError(404, 'Note not found');
    if (note.authorId !== viewerId) {
      throw new HttpError(403, 'Notes are private to their author');
    }
    return note;
  }

  private toDTO(note: Note): NoteDTO {
    return {
      id: note.id,
      roomId: note.roomId,
      authorId: note.authorId,
      title: note.title,
      body: note.body,
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}

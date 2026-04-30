/**
 * Private GM notes (Ф7.1).
 * Visibility invariant: notes are visible ONLY to their author. A different
 * GM in the same room MUST receive 403 — see NoteService.getById.
 */
export interface NoteDTO {
  id: string;
  roomId: string;
  authorId: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface NoteCreateRequest {
  title: string;
  body: string;
}

export interface NoteUpdateRequest {
  title?: string;
  body?: string;
}

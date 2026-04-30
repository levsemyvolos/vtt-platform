import type { NoteDTO, NoteCreateRequest, NoteUpdateRequest } from '@vtt/shared';
import { apiFetch } from './apiFetch';

/** GET /rooms/:roomId/notes — нотатки автентикованого GM поточної кімнати. */
export function listNotes(roomId: string): Promise<NoteDTO[]> {
  return apiFetch<NoteDTO[]>(`/api/rooms/${roomId}/notes`);
}

/** POST /rooms/:roomId/notes — створення нової нотатки. */
export function createNote(roomId: string, req: NoteCreateRequest): Promise<NoteDTO> {
  return apiFetch<NoteDTO>(`/api/rooms/${roomId}/notes`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** GET /notes/:id — повна нотатка (для редагування). */
export function getNote(id: string): Promise<NoteDTO> {
  return apiFetch<NoteDTO>(`/api/notes/${id}`);
}

/** PATCH /notes/:id — часткове оновлення title/body. */
export function updateNote(id: string, req: NoteUpdateRequest): Promise<NoteDTO> {
  return apiFetch<NoteDTO>(`/api/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
}

/** DELETE /notes/:id — видалення нотатки. */
export function deleteNote(id: string): Promise<void> {
  return apiFetch<void>(`/api/notes/${id}`, { method: 'DELETE' });
}

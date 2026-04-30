import type {
  CharacterSheetDTO,
  CharacterCreateRequest,
  CharacterUpdateRequest,
} from '@vtt/shared';
import { apiFetch } from './apiFetch';

/** GET /rooms/:roomId/characters — список персонажів кімнати (RBAC-проєкція). */
export function listCharacters(roomId: string): Promise<CharacterSheetDTO[]> {
  return apiFetch<CharacterSheetDTO[]>(`/api/rooms/${roomId}/characters`);
}

/** GET /characters/:id — повний аркуш (для власника/GM) або short-проєкція. */
export function getCharacter(id: string): Promise<CharacterSheetDTO> {
  return apiFetch<CharacterSheetDTO>(`/api/characters/${id}`);
}

/** POST /rooms/:roomId/characters — створення нового аркуша. */
export function createCharacter(
  roomId: string,
  req: CharacterCreateRequest,
): Promise<CharacterSheetDTO> {
  return apiFetch<CharacterSheetDTO>(`/api/rooms/${roomId}/characters`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** PATCH /characters/:id — часткове оновлення (RBAC: лише власник). */
export function updateCharacter(
  id: string,
  req: CharacterUpdateRequest,
): Promise<CharacterSheetDTO> {
  return apiFetch<CharacterSheetDTO>(`/api/characters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
}

/** DELETE /characters/:id — видалення (узгодити політику з backend). */
export function deleteCharacter(id: string): Promise<void> {
  return apiFetch<void>(`/api/characters/${id}`, { method: 'DELETE' });
}

/**
 * POST /characters/:id/pdf — raw PDF bytes (Content-Type: application/pdf).
 * The server uses express.raw({ type: 'application/pdf' }) so we send the file
 * directly rather than wrapping it in multipart. apiFetch handles the 401-refresh
 * queue (R7 closed).
 */
export function uploadCharacterPdf(id: string, file: File): Promise<CharacterSheetDTO> {
  return apiFetch<CharacterSheetDTO>(`/api/characters/${id}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
}

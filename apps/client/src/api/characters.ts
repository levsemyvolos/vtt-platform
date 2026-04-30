import type {
  CharacterSheetDTO,
  CharacterCreateRequest,
  CharacterUpdateRequest,
} from '@vtt/shared';
import { apiFetch, ApiError } from './apiFetch';
import { tokenStore } from './tokenStore';

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
 * POST /characters/:id/pdf (multipart/form-data, поле "file").
 * Окремий шлях fetch'у потрібен тому, що `apiFetch` примусово виставляє
 * Content-Type: application/json. Тут довіряємо браузеру самому виставити
 * boundary multipart-секції; refresh-flow реалізовано спрощено (без черги).
 */
export async function uploadCharacterPdf(
  id: string,
  file: File,
): Promise<CharacterSheetDTO> {
  const url = `/api/characters/${id}/pdf`;
  const form = new FormData();
  form.append('file', file);

  const access = tokenStore.getAccess();
  const headers: Record<string, string> = {};
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const res = await fetch(url, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ApiError(res.status, body.error?.message ?? res.statusText);
  }
  return (await res.json()) as CharacterSheetDTO;
}

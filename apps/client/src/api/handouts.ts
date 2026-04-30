import type {
  HandoutDTO,
  HandoutCreateRequest,
  HandoutGrantRequest,
} from '@vtt/shared';
import { apiFetch } from './apiFetch';

/** GET /rooms/:roomId/handouts — для GM усі, для Player — лише grant'нуті. */
export function listHandouts(roomId: string): Promise<HandoutDTO[]> {
  return apiFetch<HandoutDTO[]>(`/api/rooms/${roomId}/handouts`);
}

/** POST /rooms/:roomId/handouts — створення нового handout (RBAC: GM). */
export function createHandout(
  roomId: string,
  req: HandoutCreateRequest,
): Promise<HandoutDTO> {
  return apiFetch<HandoutDTO>(`/api/rooms/${roomId}/handouts`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** POST /handouts/:id/grant — додає список користувачів до recipientIds. */
export function grantHandout(handoutId: string, userIds: string[]): Promise<HandoutDTO> {
  const body: HandoutGrantRequest = { userIds };
  return apiFetch<HandoutDTO>(`/api/handouts/${handoutId}/grant`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** DELETE /handouts/:id/recipients/:userId — відкликає доступ конкретного гравця. */
export function revokeHandout(handoutId: string, userId: string): Promise<HandoutDTO> {
  return apiFetch<HandoutDTO>(`/api/handouts/${handoutId}/recipients/${userId}`, {
    method: 'DELETE',
  });
}

/** DELETE /handouts/:id — повне видалення handout (RBAC: GM). */
export function deleteHandout(handoutId: string): Promise<void> {
  return apiFetch<void>(`/api/handouts/${handoutId}`, { method: 'DELETE' });
}

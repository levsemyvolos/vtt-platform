import type {
  InitiativeAddRequest,
  InitiativeReorderRequest,
  InitiativeUpdatedPayload,
} from '@vtt/shared';
import { apiFetch } from './apiFetch';

/** GET /scenes/:sceneId/initiative — повертає поточний знімок треку ініціативи. */
export function listInitiative(sceneId: string): Promise<InitiativeUpdatedPayload> {
  return apiFetch<InitiativeUpdatedPayload>(`/api/scenes/${sceneId}/initiative`);
}

/** POST /scenes/:sceneId/initiative — додає нову позицію (RBAC: GM). */
export function addInitiative(
  sceneId: string,
  name: string,
  initiative: number,
  tokenId?: string,
): Promise<InitiativeUpdatedPayload> {
  const body: InitiativeAddRequest = {
    name,
    initiative,
    ...(tokenId !== undefined ? { tokenId } : {}),
  };
  return apiFetch<InitiativeUpdatedPayload>(`/api/scenes/${sceneId}/initiative`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** DELETE /scenes/:sceneId/initiative/:entryId — видаляє позицію за id. */
export function removeInitiative(
  sceneId: string,
  entryId: string,
): Promise<InitiativeUpdatedPayload> {
  return apiFetch<InitiativeUpdatedPayload>(
    `/api/scenes/${sceneId}/initiative/${entryId}`,
    { method: 'DELETE' },
  );
}

/** POST /scenes/:sceneId/initiative/reorder — застосовує нову послідовність. */
export function reorderInitiative(
  sceneId: string,
  orderedIds: string[],
): Promise<InitiativeUpdatedPayload> {
  const body: InitiativeReorderRequest = { orderedIds };
  return apiFetch<InitiativeUpdatedPayload>(`/api/scenes/${sceneId}/initiative/reorder`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST /scenes/:sceneId/initiative/advance — наступний хід / новий раунд. */
export function advanceInitiative(sceneId: string): Promise<InitiativeUpdatedPayload> {
  return apiFetch<InitiativeUpdatedPayload>(`/api/scenes/${sceneId}/initiative/advance`, {
    method: 'POST',
  });
}

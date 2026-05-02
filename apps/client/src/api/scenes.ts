import type { SceneDTO, TokenPublicDTO } from '@vtt/shared';
import type { CreateTokenRequest, UpdateTokenRequest, UpdateSceneRequest } from '@vtt/shared';
import { apiFetch } from './apiFetch';

/**
 * Loads the current viewer's projection of a scene (RBAC-applied via A6).
 * For the lobby's "start session" flow the canonical hydration path is
 * `emitSessionResync(roomId)` — which returns scene + chat + initiatives in a
 * single A3 round-trip — so this helper is reserved for one-off scene picks.
 */
export function fetchSceneSnapshot(sceneId: string): Promise<SceneDTO> {
  return apiFetch<SceneDTO>(`/api/scenes/${sceneId}`);
}

export function apiCreateToken(
  sceneId: string,
  data: CreateTokenRequest,
): Promise<TokenPublicDTO> {
  return apiFetch<TokenPublicDTO>(`/api/scenes/${sceneId}/tokens`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiUpdateToken(
  tokenId: string,
  data: UpdateTokenRequest,
): Promise<TokenPublicDTO> {
  return apiFetch<TokenPublicDTO>(`/api/tokens/${tokenId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiDeleteToken(tokenId: string): Promise<void> {
  return apiFetch<void>(`/api/tokens/${tokenId}`, { method: 'DELETE' });
}

export function apiPatchScene(
  sceneId: string,
  data: UpdateSceneRequest,
): Promise<SceneDTO> {
  return apiFetch<SceneDTO>(`/api/scenes/${sceneId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

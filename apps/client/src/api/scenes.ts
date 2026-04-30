import type { SceneDTO } from '@vtt/shared';
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

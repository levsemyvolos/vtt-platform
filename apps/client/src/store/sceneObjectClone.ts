import type { SceneObject } from '@vtt/shared';

/**
 * Build a client-side clone of a SceneObject for optimistic duplication
 * during Edit Scene staging. Mirrors the server duplicateObject logic in
 * SceneAnnotationService.ts: new UUID, +20 offset, zIndex top of stack.
 *
 * On Edit Scene Done, the full annotations payload is flushed to server,
 * which persists the local-id copy faithfully (no id collision since UUIDs
 * are globally unique).
 *
 * @param source     The object to clone.
 * @param allObjects All current objects in the scene (used to compute max zIndex).
 * @param newUserId  The current GM's userId (passed explicitly for testability).
 */
export function buildClonedObject(
  source: SceneObject,
  allObjects: SceneObject[],
  newUserId: string,
): SceneObject {
  const newId = crypto.randomUUID();
  const maxZ =
    allObjects.length > 0
      ? Math.max(...allObjects.map((o) => o.zIndex))
      : -1;

  const base = {
    ...source,
    id: newId,
    x: source.x + 20,
    y: source.y + 20,
    zIndex: maxZ + 1,
    userId: newUserId,
  };

  // Re-assert the discriminated-union type so TypeScript is satisfied with
  // exactOptionalPropertyTypes. The spread already carries the correct `type`
  // discriminant — we just need the cast to flow through.
  return base as SceneObject;
}

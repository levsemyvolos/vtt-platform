import type { TokenPublicDTO } from '@vtt/shared';
import { store } from './index';
import { popToRedo, popToUndo, pushUndoEntry, type UndoEntry } from './undoHistory';
import {
  appendSceneObject,
  removeSceneObject,
  transformSceneObjectOptimistic,
  moveSceneObjectOptimistic,
  lockSceneObject,
  setSceneObjectLayer,
  setSceneObjectVisibility,
  applyDrawStroke,
  fogShapeAdded,
  fogShapeRemoved,
  fogShapesSet,
  clearFogMask,
  clearDrawStrokes,
  moveTokenOptimistic,
} from './scene';
import {
  emitObjectDelete,
  emitObjectLock,
  emitObjectSetLayer,
  emitObjectSetVisibility,
  emitObjectTransform,
  emitObjectUpsert,
  emitObjectMove,
  emitDrawStroke,
  emitDrawClear,
  emitFogShapeAdd,
  emitFogShapeRemove,
  emitFogClear,
  emitTokenMove,
} from '../api/socket';

/**
 * Sess 7.5 — central dispatcher for the undo/redo stack.
 *
 * Each UndoEntry records a `before` and `after` slice of state. Applying an
 * entry in either direction re-uses the SAME socket emit + reducer pathway as
 * the forward action: undo just sends the before-snapshot, redo sends the
 * after-snapshot. Other clients see the rollback as a normal mutation, so no
 * dedicated "undo" server contract is required.
 *
 * The recorder side (action-site hooks) MUST capture both snapshots BEFORE
 * dispatching, because the after-snapshot for some operations (move, transform)
 * is the value about to be applied, not the post-Redux state.
 */

interface RoomScene {
  roomId: string;
  sceneId: string;
}

function getRoomScene(): RoomScene | null {
  const state = store.getState();
  const roomId = state.room.currentRoom?.id;
  const sceneId = state.scene.current?.id;
  if (!roomId || !sceneId) return null;
  return { roomId, sceneId };
}

function isUndoableNow(): boolean {
  const state = store.getState();
  if (state.room.editingSceneId !== null) return false; // Cancel button covers Edit Scene
  const myUserId = state.session.currentUser?.id;
  const myMember = state.room.members.find((m) => m.userId === myUserId);
  return myMember?.role === 'GM';
}

/* ------------------------------------------------------------------ */
/*  Per-kind appliers — one helper per UndoEntry kind                 */
/* ------------------------------------------------------------------ */

function applyObjectTransform(
  entry: Extract<UndoEntry, { kind: 'object_transform' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  const snap = direction === 'undo' ? entry.before : entry.after;
  store.dispatch(transformSceneObjectOptimistic({ objectId: snap.id, ...snap }));
  emitObjectTransform({ ...rs, objectId: snap.id, ...snap });
}

function applyObjectMove(
  entry: Extract<UndoEntry, { kind: 'object_move' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  const snap = direction === 'undo' ? entry.before : entry.after;
  store.dispatch(moveSceneObjectOptimistic({ objectId: snap.id, x: snap.x, y: snap.y }));
  emitObjectMove({ ...rs, objectId: snap.id, x: snap.x, y: snap.y });
}

function applyObjectAdd(
  entry: Extract<UndoEntry, { kind: 'object_add' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    store.dispatch(removeSceneObject(entry.object.id));
    emitObjectDelete({ ...rs, objectId: entry.object.id });
  } else {
    store.dispatch(appendSceneObject(entry.object));
    emitObjectUpsert({ ...rs, object: entry.object });
  }
}

function applyObjectDelete(
  entry: Extract<UndoEntry, { kind: 'object_delete' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    store.dispatch(appendSceneObject(entry.object));
    emitObjectUpsert({ ...rs, object: entry.object });
  } else {
    store.dispatch(removeSceneObject(entry.object.id));
    emitObjectDelete({ ...rs, objectId: entry.object.id });
  }
}

function applyObjectDuplicate(
  entry: Extract<UndoEntry, { kind: 'object_duplicate' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    store.dispatch(removeSceneObject(entry.clone.id));
    emitObjectDelete({ ...rs, objectId: entry.clone.id });
  } else {
    store.dispatch(appendSceneObject(entry.clone));
    emitObjectUpsert({ ...rs, object: entry.clone });
  }
}

function applyObjectLock(
  entry: Extract<UndoEntry, { kind: 'object_lock' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  const snap = direction === 'undo' ? entry.before : entry.after;
  store.dispatch(lockSceneObject({ objectId: snap.id, locked: snap.locked }));
  emitObjectLock({ ...rs, objectId: snap.id, locked: snap.locked });
}

function applyObjectLayer(
  entry: Extract<UndoEntry, { kind: 'object_layer' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  const snap = direction === 'undo' ? entry.before : entry.after;
  store.dispatch(setSceneObjectLayer({ objectId: snap.id, layer: snap.layer }));
  emitObjectSetLayer({ ...rs, objectId: snap.id, layer: snap.layer });
}

function applyObjectVisibility(
  entry: Extract<UndoEntry, { kind: 'object_visibility' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  const snap = direction === 'undo' ? entry.before : entry.after;
  const state = store.getState();
  const myUserId = state.session.currentUser?.id;
  const myMember = state.room.members.find((m) => m.userId === myUserId);
  const viewerIsGM = myMember?.role === 'GM';
  store.dispatch(setSceneObjectVisibility({ objectId: snap.id, visibility: snap.visibility, viewerIsGM }));
  emitObjectSetVisibility({ ...rs, objectId: snap.id, visibility: snap.visibility });
}

function applyObjectZOrder(
  entry: Extract<UndoEntry, { kind: 'object_zorder' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  // ZOrder undo isn't a single front/back action — multiple objects move when
  // sequence operations stack. We replay each object as a full upsert of its
  // recorded zIndex; the upsert path is GM-only and survives normalize.
  const snap = direction === 'undo' ? entry.before : entry.after;
  const objects = store.getState().scene.current?.annotations.objects ?? [];
  for (const { id, zIndex } of snap.ordering) {
    const obj = objects.find((o) => o.id === id);
    if (!obj) continue;
    const updated = { ...obj, zIndex };
    store.dispatch(appendSceneObject(updated));
    emitObjectUpsert({ ...rs, object: updated });
  }
}

function applyFogAdd(
  entry: Extract<UndoEntry, { kind: 'fog_add' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    store.dispatch(fogShapeRemoved({ ...rs, shapeId: entry.shape.id }));
    emitFogShapeRemove({ ...rs, shapeId: entry.shape.id });
  } else {
    store.dispatch(fogShapeAdded({ ...rs, shape: entry.shape }));
    emitFogShapeAdd({ ...rs, shape: entry.shape });
  }
}

function applyFogRemove(
  entry: Extract<UndoEntry, { kind: 'fog_remove' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    store.dispatch(fogShapeAdded({ ...rs, shape: entry.shape }));
    emitFogShapeAdd({ ...rs, shape: entry.shape });
  } else {
    store.dispatch(fogShapeRemoved({ ...rs, shapeId: entry.shape.id }));
    emitFogShapeRemove({ ...rs, shapeId: entry.shape.id });
  }
}

function applyFogClear(
  entry: Extract<UndoEntry, { kind: 'fog_clear' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    // Restore the captured shapes by re-adding each one.
    store.dispatch(fogShapesSet(entry.shapes));
    for (const shape of entry.shapes) {
      emitFogShapeAdd({ ...rs, shape });
    }
  } else {
    store.dispatch(clearFogMask());
    emitFogClear(rs.roomId, rs.sceneId);
  }
}

function applyTokenMove(
  entry: Extract<UndoEntry, { kind: 'token_move' }>,
  direction: 'undo' | 'redo',
): void {
  // Token undo uses the same OCC pathway as a fresh move. If the server's
  // current version is higher than what was recorded, the server will
  // emit a `token:rollback` and the visual reverts — undo failing
  // gracefully instead of silently corrupting state.
  const snap = direction === 'undo' ? entry.before : entry.after;
  const state = store.getState();
  const token = state.scene.current?.tokens.find((t) => t.id === snap.tokenId);
  if (!token) return;
  store.dispatch(moveTokenOptimistic({ tokenId: snap.tokenId, x: snap.x, y: snap.y }));
  void emitTokenMove({
    tokenId: snap.tokenId,
    x: snap.x,
    y: snap.y,
    sceneId: state.scene.current!.id,
    clientSeq: token.version,
  });
}

function applyDrawStrokeEntry(
  entry: Extract<UndoEntry, { kind: 'draw_stroke' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    store.dispatch(removeSceneObject(entry.object.id));
    emitObjectDelete({ ...rs, objectId: entry.object.id });
  } else {
    store.dispatch(applyDrawStroke(entry.stroke));
    emitDrawStroke(entry.stroke);
  }
}

function applyDrawClearEntry(
  entry: Extract<UndoEntry, { kind: 'draw_clear' }>,
  direction: 'undo' | 'redo',
  rs: RoomScene,
): void {
  if (direction === 'undo') {
    // Restore each captured stroke object via upsert (preserves transform state).
    for (const obj of entry.objects) {
      store.dispatch(appendSceneObject(obj));
      emitObjectUpsert({ ...rs, object: obj });
    }
  } else {
    store.dispatch(clearDrawStrokes());
    emitDrawClear(rs.roomId, rs.sceneId);
  }
}

type Applier = (entry: UndoEntry, direction: 'undo' | 'redo', rs: RoomScene) => void;

// Cyclomatic-complexity gate friendly dispatch — table lookup beats long switch
// (the lint gate is 10; we have 15 kinds).
const APPLIERS: { [K in UndoEntry['kind']]: Applier } = {
  object_transform: (e, d, rs) => applyObjectTransform(e as Extract<UndoEntry, { kind: 'object_transform' }>, d, rs),
  object_move: (e, d, rs) => applyObjectMove(e as Extract<UndoEntry, { kind: 'object_move' }>, d, rs),
  object_add: (e, d, rs) => applyObjectAdd(e as Extract<UndoEntry, { kind: 'object_add' }>, d, rs),
  object_delete: (e, d, rs) => applyObjectDelete(e as Extract<UndoEntry, { kind: 'object_delete' }>, d, rs),
  object_duplicate: (e, d, rs) => applyObjectDuplicate(e as Extract<UndoEntry, { kind: 'object_duplicate' }>, d, rs),
  object_lock: (e, d, rs) => applyObjectLock(e as Extract<UndoEntry, { kind: 'object_lock' }>, d, rs),
  object_layer: (e, d, rs) => applyObjectLayer(e as Extract<UndoEntry, { kind: 'object_layer' }>, d, rs),
  object_visibility: (e, d, rs) => applyObjectVisibility(e as Extract<UndoEntry, { kind: 'object_visibility' }>, d, rs),
  object_zorder: (e, d, rs) => applyObjectZOrder(e as Extract<UndoEntry, { kind: 'object_zorder' }>, d, rs),
  fog_add: (e, d, rs) => applyFogAdd(e as Extract<UndoEntry, { kind: 'fog_add' }>, d, rs),
  fog_remove: (e, d, rs) => applyFogRemove(e as Extract<UndoEntry, { kind: 'fog_remove' }>, d, rs),
  fog_clear: (e, d, rs) => applyFogClear(e as Extract<UndoEntry, { kind: 'fog_clear' }>, d, rs),
  token_move: (e, d) => applyTokenMove(e as Extract<UndoEntry, { kind: 'token_move' }>, d),
  draw_stroke: (e, d, rs) => applyDrawStrokeEntry(e as Extract<UndoEntry, { kind: 'draw_stroke' }>, d, rs),
  draw_clear: (e, d, rs) => applyDrawClearEntry(e as Extract<UndoEntry, { kind: 'draw_clear' }>, d, rs),
};

function applyEntry(entry: UndoEntry, direction: 'undo' | 'redo'): void {
  const rs = getRoomScene();
  if (!rs) return;
  APPLIERS[entry.kind](entry, direction, rs);
}

/** Records a new action onto the undo stack. Called from action sites (transform
 *  end, drag end, context menu, fog handler, etc.). Skips recording in Edit
 *  Scene mode — that flow already has Cancel for rollback. */
export function recordUndo(entry: UndoEntry): void {
  if (store.getState().room.editingSceneId !== null) return;
  store.dispatch(pushUndoEntry(entry));
}

/** Public API — called by Ctrl+Z handler / toolbar Undo button. */
export function performUndo(): void {
  if (!isUndoableNow()) return;
  const state = store.getState();
  const top = state.undoHistory.past.at(-1);
  if (!top) return;
  applyEntry(top, 'undo');
  store.dispatch(popToRedo());
}

/** Public API — called by Ctrl+Y / Ctrl+Shift+Z handler / toolbar Redo button. */
export function performRedo(): void {
  if (!isUndoableNow()) return;
  const state = store.getState();
  const top = state.undoHistory.future.at(-1);
  if (!top) return;
  applyEntry(top, 'redo');
  store.dispatch(popToUndo());
}

// Re-export for convenience in components that import only this module.
export type { TokenPublicDTO };

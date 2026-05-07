import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { store } from '../../store';
import {
  appendSceneObject,
  lockSceneObject,
  removeSceneObject,
  setSceneObjectLayer,
  setSceneObjectVisibility,
  setSceneObjectZIndex,
  transformSceneObjectOptimistic,
} from '../../store/scene';
import {
  emitObjectDelete,
  emitObjectDuplicate,
  emitObjectLock,
  emitObjectSetLayer,
  emitObjectSetVisibility,
  emitObjectTransform,
  emitObjectZOrder,
} from '../../api/socket';
import type { SceneObject, SceneObjectLayer, SceneObjectVisibility } from '@vtt/shared';
import { buildClonedObject } from '../../store/sceneObjectClone';
import { recordUndo } from '../../store/undoDispatcher';
import styles from './SceneObjectContextMenu.module.css';

/** Whether a SceneObject has any non-identity transform applied (Sess 7).
 *  Used to gate the "Reset transform" menu item — no point showing it on a
 *  pristine object. */
function hasAppliedTransform(obj: SceneObject): boolean {
  if ((obj.rotation ?? 0) !== 0) return true;
  if (obj.type === 'stroke') {
    return (obj.scaleX ?? 1) !== 1 || (obj.scaleY ?? 1) !== 1;
  }
  return false;
}

/** Per-type fields preserved on Reset transform — image keeps width/height,
 *  text keeps fontSize, stroke resets scaleX/scaleY back to identity.
 *  Extracted to keep handleResetTransform within the cyclomatic gate. */
function transformFieldsByType(obj: SceneObject): {
  before: Partial<{ width: number; height: number; fontSize: number; scaleX: number; scaleY: number }>;
  after: Partial<{ width: number; height: number; fontSize: number; scaleX: number; scaleY: number }>;
} {
  if (obj.type === 'image') {
    const fields = { width: obj.width, height: obj.height };
    return { before: fields, after: fields };
  }
  if (obj.type === 'text') {
    const fields = { fontSize: obj.fontSize };
    return { before: fields, after: fields };
  }
  return {
    before: { scaleX: obj.scaleX ?? 1, scaleY: obj.scaleY ?? 1 },
    after: { scaleX: 1, scaleY: 1 },
  };
}

interface SceneObjectContextMenuProps {
  objectId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export default function SceneObjectContextMenu({
  objectId,
  x,
  y,
  onClose,
}: SceneObjectContextMenuProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const ref = useRef<HTMLDivElement>(null);

  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const sceneId = useAppSelector((s) => s.scene.current?.id ?? '');
  const obj = useAppSelector((s) =>
    s.scene.current?.annotations.objects?.find((o) => o.id === objectId),
  );
  const isLocked = obj?.locked === true;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!obj) {
    onClose();
    return null;
  }

  function captureZOrderingSnapshot(): { id: string; zIndex: number }[] {
    const objects = store.getState().scene.current?.annotations.objects ?? [];
    return objects.map((o) => ({ id: o.id, zIndex: o.zIndex }));
  }

  function handleFront(): void {
    const before = captureZOrderingSnapshot();
    emitObjectZOrder({ roomId, sceneId, objectId, direction: 'front' });
    dispatch(setSceneObjectZIndex({ objectId, direction: 'front' }));
    recordUndo({ kind: 'object_zorder', before: { ordering: before }, after: { ordering: captureZOrderingSnapshot() } });
    onClose();
  }

  function handleBack(): void {
    const before = captureZOrderingSnapshot();
    emitObjectZOrder({ roomId, sceneId, objectId, direction: 'back' });
    dispatch(setSceneObjectZIndex({ objectId, direction: 'back' }));
    recordUndo({ kind: 'object_zorder', before: { ordering: before }, after: { ordering: captureZOrderingSnapshot() } });
    onClose();
  }

  function handleToggleLock(): void {
    const next = !isLocked;
    emitObjectLock({ roomId, sceneId, objectId, locked: next });
    dispatch(lockSceneObject({ objectId, locked: next }));
    recordUndo({
      kind: 'object_lock',
      before: { id: objectId, locked: !next },
      after: { id: objectId, locked: next },
    });
    onClose();
  }

  function handleDuplicate(): void {
    const state = store.getState();
    const inEditScene = state.room.editingSceneId !== null;
    if (inEditScene) {
      // Edit Scene: optimistic local clone only — flushed to server on Done.
      // No emit, so players don't see it until the scene is saved.
      const objects = state.scene.current?.annotations.objects ?? [];
      const source = objects.find((o) => o.id === objectId);
      if (source) {
        const userId = state.session.currentUser?.id ?? '';
        const clone = buildClonedObject(source, objects, userId);
        dispatch(appendSceneObject(clone));
      }
    } else {
      // Play mode: emit to server. Server creates the canonical copy and
      // broadcasts object:duplicated → appendSceneObject on all clients.
      // Undo recording happens on the broadcast handler so we have the new id.
      emitObjectDuplicate({ roomId, sceneId, objectId });
    }
    onClose();
  }

  function handleDelete(): void {
    if (!obj) return onClose();
    // Snapshot must happen BEFORE dispatch — removeSceneObject mutates state.
    const snapshot = JSON.parse(JSON.stringify(obj)) as SceneObject;
    emitObjectDelete({ roomId, sceneId, objectId });
    dispatch(removeSceneObject(objectId));
    recordUndo({ kind: 'object_delete', object: snapshot });
    onClose();
  }

  /** Resets rotation (and stroke matrix scale) to identity (Sess 7).
   *  Image/text retain their baked width/height/fontSize — only rotation is undone. */
  function handleResetTransform(): void {
    if (!obj) return;
    const typeFields = transformFieldsByType(obj);
    const before = { id: obj.id, x: obj.x, y: obj.y, rotation: obj.rotation ?? 0, ...typeFields.before };
    const after = { id: obj.id, x: obj.x, y: obj.y, rotation: 0, ...typeFields.after };
    dispatch(transformSceneObjectOptimistic({ objectId: obj.id, ...after }));
    emitObjectTransform({ roomId, sceneId, objectId: obj.id, ...after });
    recordUndo({ kind: 'object_transform', before, after });
    onClose();
  }

  function handleSetLayer(layer: SceneObjectLayer): void {
    if (!obj) return;
    const previousLayer = obj.layer;
    const inEditScene = store.getState().room.editingSceneId !== null;
    dispatch(setSceneObjectLayer({ objectId, layer }));
    if (!inEditScene) {
      emitObjectSetLayer({ roomId, sceneId, objectId, layer });
    }
    recordUndo({
      kind: 'object_layer',
      before: { id: objectId, layer: previousLayer },
      after: { id: objectId, layer },
    });
    onClose();
  }

  function handleToggleVisibility(): void {
    if (!obj) return;
    const previousVisibility = obj.visibility;
    const next: SceneObjectVisibility = obj.visibility === 'gm-only' ? 'all' : 'gm-only';
    const inEditScene = store.getState().room.editingSceneId !== null;
    const myUserId = store.getState().session.currentUser?.id;
    const myMember = store.getState().room.members.find((m) => m.userId === myUserId);
    const viewerIsGM = myMember?.role === 'GM';
    dispatch(setSceneObjectVisibility({ objectId, visibility: next, viewerIsGM }));
    if (!inEditScene) {
      emitObjectSetVisibility({ roomId, sceneId, objectId, visibility: next });
    }
    recordUndo({
      kind: 'object_visibility',
      before: { id: objectId, visibility: previousVisibility },
      after: { id: objectId, visibility: next },
    });
    onClose();
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      aria-label={t('sceneObjectMenu.label')}
    >
      <button
        className={styles.item}
        role="menuitem"
        onClick={handleFront}
      >
        {t('sceneObjectMenu.front')}
      </button>
      <button
        className={styles.item}
        role="menuitem"
        onClick={handleBack}
      >
        {t('sceneObjectMenu.back')}
      </button>
      <button
        className={styles.item}
        role="menuitem"
        onClick={handleToggleLock}
      >
        {isLocked ? t('sceneObjectMenu.unlock') : t('sceneObjectMenu.lock')}
      </button>
      <label className={styles.fieldRow}>
        <span className={styles.layerLabel}>{t('sceneObjectMenu.layerLabel')}</span>
        <select
          className={styles.layerSelect}
          value={obj?.layer ?? 'overlay'}
          onChange={(e) => { handleSetLayer(e.target.value as SceneObjectLayer); }}
          aria-label={t('sceneObjectMenu.layerLabel')}
        >
          <option value="tile">{t('sceneObjectMenu.layer.tile')}</option>
          <option value="overlay">{t('sceneObjectMenu.layer.overlay')}</option>
        </select>
      </label>
      <button
        className={styles.item}
        role="menuitem"
        onClick={handleToggleVisibility}
      >
        {obj?.visibility === 'gm-only'
          ? t('sceneObjectMenu.makeVisibleToAll')
          : t('sceneObjectMenu.makeGmOnly')}
      </button>
      <button
        className={styles.item}
        role="menuitem"
        onClick={handleDuplicate}
      >
        {t('sceneObjectMenu.duplicate')}
      </button>
      {hasAppliedTransform(obj) && (
        <button
          className={styles.item}
          role="menuitem"
          onClick={handleResetTransform}
        >
          {t('sceneObjectMenu.resetTransform')}
        </button>
      )}
      <button
        className={`${styles.item} ${styles['item--danger']}`}
        role="menuitem"
        onClick={handleDelete}
      >
        {t('sceneObjectMenu.delete')}
      </button>
    </div>
  );
}

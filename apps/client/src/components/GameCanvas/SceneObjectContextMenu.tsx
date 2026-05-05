import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { store } from '../../store';
import {
  appendSceneObject,
  lockSceneObject,
  removeSceneObject,
  setSceneObjectZIndex,
} from '../../store/scene';
import {
  emitObjectDelete,
  emitObjectDuplicate,
  emitObjectLock,
  emitObjectZOrder,
} from '../../api/socket';
import { buildClonedObject } from '../../store/sceneObjectClone';
import styles from './SceneObjectContextMenu.module.css';

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

  function handleFront(): void {
    emitObjectZOrder({ roomId, sceneId, objectId, direction: 'front' });
    dispatch(setSceneObjectZIndex({ objectId, direction: 'front' }));
    onClose();
  }

  function handleBack(): void {
    emitObjectZOrder({ roomId, sceneId, objectId, direction: 'back' });
    dispatch(setSceneObjectZIndex({ objectId, direction: 'back' }));
    onClose();
  }

  function handleToggleLock(): void {
    const next = !isLocked;
    emitObjectLock({ roomId, sceneId, objectId, locked: next });
    dispatch(lockSceneObject({ objectId, locked: next }));
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
      emitObjectDuplicate({ roomId, sceneId, objectId });
    }
    onClose();
  }

  function handleDelete(): void {
    emitObjectDelete({ roomId, sceneId, objectId });
    dispatch(removeSceneObject(objectId));
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
      <button
        className={styles.item}
        role="menuitem"
        onClick={handleDuplicate}
      >
        {t('sceneObjectMenu.duplicate')}
      </button>
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

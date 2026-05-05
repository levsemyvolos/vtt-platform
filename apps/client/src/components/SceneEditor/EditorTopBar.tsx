import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { stopEditing } from '../../store/room';
import { hydrateScene } from '../../store/scene';
import { setActiveTool } from '../../store/canvasViewport';
import { apiFetch } from '../../api/apiFetch';
import { flushEditedScene } from '../../api/socket';
import { Button, Logo } from '../ui';
import styles from './EditorTopBar.module.css';

export default function EditorTopBar(): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const roomName = useAppSelector((s) => s.room.currentRoom?.name ?? '');
  const sceneName = useAppSelector((s) => s.scene.current?.name ?? '');
  const editingSceneId = useAppSelector((s) => s.room.editingSceneId);
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const [busy, setBusy] = useState(false);

  function exitEditMode(): void {
    dispatch(setActiveTool('select'));
    dispatch(stopEditing());
  }

  async function handleCancel(): Promise<void> {
    if (!editingSceneId) {
      exitEditMode();
      return;
    }
    setBusy(true);
    try {
      // Refetch authoritative scene state to discard any local-only edits
      // (fog/draw/object mutations were buffered locally while editing).
      const snapshot = await apiFetch<SceneDTO>(`/api/scenes/${editingSceneId}`);
      dispatch(hydrateScene(snapshot));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SceneEditor] cancel refetch failed', err);
    } finally {
      setBusy(false);
      exitEditMode();
    }
  }

  function handleDone(): void {
    if (!editingSceneId || !roomId) {
      exitEditMode();
      return;
    }
    // Stop editing FIRST so the emit guards in socket.ts let the replay through.
    dispatch(stopEditing());
    flushEditedScene(roomId, editingSceneId);
    dispatch(setActiveTool('select'));
  }

  return (
    <header className={styles.topBar}>
      <div className={styles.logoWrap}>
        <Logo size={20} />
      </div>
      <nav className={styles.breadcrumb} aria-label="breadcrumb">
        <span className={styles.crumb}>{roomName}</span>
        <span className={styles.sep} aria-hidden="true">/</span>
        <span className={styles.crumb}>{sceneName}</span>
        <span className={styles.sep} aria-hidden="true">/</span>
        <span className={styles.crumbActive}>{t('sceneEditor.breadcrumb')}</span>
      </nav>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleCancel()}
          disabled={busy}
        >
          {t('sceneEditor.cancelBtn')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleDone}
          disabled={busy}
        >
          {t('sceneEditor.doneBtn')}
        </Button>
      </div>
    </header>
  );
}

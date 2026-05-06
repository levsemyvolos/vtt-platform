import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector, store } from '../../store';
import { stopEditing } from '../../store/room';
import { hydrateScene, clearDraftSceneUpdate } from '../../store/scene';
import { setActiveTool } from '../../store/canvasViewport';
import { apiFetch } from '../../api/apiFetch';
import { flushEditedScene } from '../../api/socket';
import { apiPatchScene } from '../../api/scenes';
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
      // hydrateScene also resets draftPatch to null (Mini-A), so the buffered
      // scene-level draft (background/grid) is discarded automatically.
      const snapshot = await apiFetch<SceneDTO>(`/api/scenes/${editingSceneId}`);
      dispatch(hydrateScene(snapshot));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SceneEditor] cancel refetch failed', err);
      // If the refetch failed, still clear the draft so we don't leave stale
      // buffered data behind.
      dispatch(clearDraftSceneUpdate());
    } finally {
      setBusy(false);
      exitEditMode();
    }
  }

  async function handleDone(): Promise<void> {
    if (!editingSceneId || !roomId) {
      exitEditMode();
      return;
    }
    setBusy(true);
    try {
      // Flush buffered scene-level patch (background, grid) BEFORE annotations flush.
      // Reading directly from store (not useSelector closure) to get the freshest value
      // at the moment the user clicks Done — same pattern as apps/client/src/api/socket.ts:24.
      // Sending without staged=1 so server broadcasts scene:snapshot to all in room.
      const draft = store.getState().scene.draftPatch;
      if (draft !== null && Object.keys(draft).length > 0) {
        await apiPatchScene(editingSceneId, draft);
        // The server broadcast (scene:snapshot) will hydrate all clients including this one.
        // We still dispatch clearDraftSceneUpdate here to avoid a brief tick of staleness.
      }
      dispatch(clearDraftSceneUpdate());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SceneEditor] Done flush failed', err);
      // Continue with annotations flush + exit even if scene PATCH failed.
      // UX preference: don't trap GM in editor on transient network error.
      dispatch(clearDraftSceneUpdate());
    } finally {
      setBusy(false);
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
          onClick={() => void handleDone()}
          disabled={busy}
        >
          {t('sceneEditor.doneBtn')}
        </Button>
      </div>
    </header>
  );
}

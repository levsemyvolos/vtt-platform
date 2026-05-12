import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { stopEditing } from '../../store/room';
import { hydrateScene } from '../../store/scene';
import { setActiveTool } from '../../store/canvasViewport';
import { apiFetch } from '../../api/apiFetch';
import { EditorTopBar, EditorToolbarLeft, EditorToolbarRight } from '../../components/SceneEditor';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import ToolPicker from '../../components/GameCanvas/ToolPicker';
import FogControlsPopover from '../../components/GameRoom/FogControlsPopover';
import styles from './SceneEditor.module.css';

export default function SceneEditor(): JSX.Element | null {
  const { t } = useTranslation('room');
  const dispatch = useAppDispatch();
  const { currentRoom, editingSceneId, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const scene = useAppSelector((s) => s.scene.current);

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const myRole = myMember?.role ?? 'Observer';
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);

  useEffect(() => {
    if (myRole !== 'GM') {
      dispatch(stopEditing());
      return;
    }
    if (editingSceneId) {
      // Reset tool when entering Edit Scene so we always start neutral.
      dispatch(setActiveTool('select'));
      apiFetch<SceneDTO>(`/api/scenes/${editingSceneId}`)
        .then((snapshot) => {
          dispatch(hydrateScene(snapshot));
        })
        .catch(console.error);
    }
  }, [myRole, dispatch, editingSceneId]);

  if (!currentRoom || myRole !== 'GM') return null;

  const roomId = currentRoom.id;
  const sceneId = editingSceneId ?? scene?.id ?? '';

  return (
    <div className={styles.editor} data-testid="scene-editor">
      <EditorTopBar />
      <EditorToolbarLeft roomId={roomId} sceneId={sceneId} />
      <div className={styles.canvasZone} data-testid="scene-editor-canvas" aria-label={t('sceneEditor.canvasAriaLabel')}>
        <div className={styles.toolStrip} role="toolbar" aria-label={t('sceneEditor.toolsAriaLabel')}>
          <ToolPicker myRole={myRole} hideEphemeral />
        </div>
        {scene && (
          <GameCanvas
            scene={scene}
            myRole={myRole}
            myUserId={currentUser?.id ?? ''}
            mode="edit"
          />
        )}
        {scene && activeTool === 'fog' && (
          <FogControlsPopover roomId={roomId} />
        )}
      </div>
      <EditorToolbarRight />
    </div>
  );
}

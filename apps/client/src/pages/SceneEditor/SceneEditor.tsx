import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { stopEditing } from '../../store/room';
import { EditorTopBar, EditorToolbarLeft, EditorToolbarRight } from '../../components/SceneEditor';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import styles from './SceneEditor.module.css';

export default function SceneEditor(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { currentRoom, editingSceneId, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const scene = useAppSelector((s) => s.scene.current);

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const myRole = myMember?.role ?? 'Observer';

  useEffect(() => {
    if (myRole !== 'GM') {
      dispatch(stopEditing());
    }
  }, [myRole, dispatch]);

  if (!currentRoom || myRole !== 'GM') return null;

  const roomId = currentRoom.id;
  const sceneId = editingSceneId ?? scene?.id ?? '';

  return (
    <div className={styles.editor} data-testid="scene-editor">
      <EditorTopBar />
      <EditorToolbarLeft roomId={roomId} sceneId={sceneId} />
      <div className={styles.canvasZone} data-testid="scene-editor-canvas" aria-label="Scene canvas">
        {scene && (
          <GameCanvas
            scene={scene}
            myRole={myRole}
            myUserId={currentUser?.id ?? ''}
            mode="edit"
          />
        )}
      </div>
      <EditorToolbarRight />
    </div>
  );
}

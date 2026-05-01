import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { stopEditing } from '../../store/room';
import { EditorTopBar, EditorToolbarLeft, EditorToolbarRight } from '../../components/SceneEditor';
import styles from './SceneEditor.module.css';

export default function SceneEditor(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const myRole = myMember?.role ?? 'Observer';

  // GM-only guard: non-GM users are sent back to GameRoom via stopEditing
  useEffect(() => {
    if (myRole !== 'GM') {
      dispatch(stopEditing());
    }
  }, [myRole, dispatch]);

  if (!currentRoom || myRole !== 'GM') return null;

  return (
    <div className={styles.editor} data-testid="scene-editor">
      <EditorTopBar />
      <EditorToolbarLeft />
      <div
        className={styles.canvasZone}
        data-testid="scene-editor-canvas"
        aria-label="Scene canvas"
      />
      <EditorToolbarRight />
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { stopEditing } from '../../store/room';
import { Button, Logo } from '../ui';
import styles from './EditorTopBar.module.css';

export default function EditorTopBar(): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const roomName = useAppSelector((s) => s.room.currentRoom?.name ?? '');
  const sceneName = useAppSelector((s) => s.scene.current?.name ?? '');

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
      <Button
        variant="primary"
        size="sm"
        onClick={() => { dispatch(stopEditing()); }}
      >
        {t('sceneEditor.doneBtn')}
      </Button>
    </header>
  );
}

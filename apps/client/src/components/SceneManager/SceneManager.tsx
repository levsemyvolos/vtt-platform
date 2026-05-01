import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadScenes, activateScene } from '../../store/scenes';
import { startEditing } from '../../store/room';
import CreateSceneModal from './CreateSceneModal';
import styles from './SceneManager.module.css';

interface SceneManagerProps {
  roomId: string;
  myRole: Role;
}

export default function SceneManager({ roomId, myRole }: SceneManagerProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { list, status, error } = useAppSelector((s) => s.scenes);
  const [showCreate, setShowCreate] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const isGM = myRole === 'GM';

  useEffect(() => {
    void dispatch(loadScenes(roomId));
  }, [dispatch, roomId]);

  async function handleActivate(sceneId: string): Promise<void> {
    setActivating(sceneId);
    try {
      await dispatch(activateScene(sceneId)).unwrap();
    } catch {
      // activation error is visible in the scene list status
    } finally {
      setActivating(null);
    }
  }

  return (
    <section className={styles.manager}>
      <div className={styles.header}>
        <h3>{t('room:scenes.heading')}</h3>
        {isGM && (
          <button
            type="button"
            className={styles.btnAdd}
            onClick={() => setShowCreate(true)}
          >
            {t('room:scenes.createBtn')}
          </button>
        )}
      </div>

      {status === 'loading' && (
        <p className={styles.status}>{t('common:status.loading')}</p>
      )}
      {status === 'error' && (
        <div className={`${styles.status} ${styles.statusError}`}>
          <p>{error?.startsWith('errors:') ? t(error as never) : error}</p>
          <button
            type="button"
            className={styles.btnAdd}
            onClick={() => void dispatch(loadScenes(roomId))}
          >
            {t('common:status.retry')}
          </button>
        </div>
      )}

      <ul className={styles.list}>
        {list.map((scene: SceneDTO) => (
          <li key={scene.id} className={styles.item}>
            <span className={styles.sceneName}>{scene.name}</span>
            {scene.isActive && (
              <span
                className={`${styles.badge} ${styles.badgeActive}`}
                title={t('room:scenes.currentActiveBadgeTitle')}
              >
                {t('room:scenes.activeBadge')}
              </span>
            )}
            {isGM && !scene.isActive && (
              <button
                type="button"
                className={styles.btnActivate}
                disabled={activating === scene.id}
                title={t('room:scenes.makeActive')}
                onClick={() => void handleActivate(scene.id)}
              >
                {activating === scene.id ? t('room:scenes.activating') : t('room:scenes.activateBtn')}
              </button>
            )}
            {isGM && (
              <button
                type="button"
                className={styles.btnActivate}
                title={t('room:scenes.editBtn')}
                onClick={() => dispatch(startEditing(scene.id))}
              >
                {t('room:scenes.editBtn')}
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && status === 'idle' && (
          <li className={`${styles.item} ${styles.itemEmpty}`}>
            {isGM ? t('room:scenes.noScenesGM') : t('room:scenes.noScenesPlayer')}
          </li>
        )}
      </ul>

      {showCreate && (
        <CreateSceneModal
          roomId={roomId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </section>
  );
}

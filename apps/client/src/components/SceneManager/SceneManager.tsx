import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Edit3, Film, FolderOpen, Plus, Star } from 'lucide-react';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadScenes, activateScene } from '../../store/scenes';
import { startEditing } from '../../store/room';
import { Button } from '../ui';
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
    <section className={`glass glass-strong ${styles.manager}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{t('room:scenes.heading')}</div>
          <h2 className={styles.title}>
            <Trans i18nKey="sceneManager.title" ns="room" components={{ em: <em /> }} />
          </h2>
        </div>
        {isGM && (
          <Button
            type="button"
            variant="primary"
            leftIcon={<Plus size={16} strokeWidth={2} />}
            onClick={() => setShowCreate(true)}
          >
            {t('room:scenes.createBtn')}
          </Button>
        )}
      </div>

      {status === 'loading' && (
        <p className={styles.status}>{t('common:status.loading')}</p>
      )}
      {status === 'error' && (
        <div className={`${styles.status} ${styles.statusError}`}>
          <p>{error?.startsWith('errors:') ? t(error as never) : error}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void dispatch(loadScenes(roomId))}
          >
            {t('common:status.retry')}
          </Button>
        </div>
      )}

      <ul className={styles.list}>
        {list.map((scene: SceneDTO) => (
          <li key={scene.id} className={styles.item} data-active={scene.isActive}>
            <span className={styles.sceneIcon} aria-hidden="true">
              {scene.isActive ? <Star size={18} strokeWidth={1.5} /> : <Film size={18} strokeWidth={1.5} />}
            </span>
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={activating === scene.id}
                title={t('room:scenes.makeActive')}
                onClick={() => void handleActivate(scene.id)}
              >
                {activating === scene.id ? t('room:scenes.activating') : t('room:scenes.activateBtn')}
              </Button>
            )}
            {isGM && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Edit3 size={14} strokeWidth={2} />}
                title={t('room:scenes.editBtn')}
                onClick={() => dispatch(startEditing(scene.id))}
              >
                {t('room:scenes.editBtn')}
              </Button>
            )}
          </li>
        ))}
        {list.length === 0 && status === 'idle' && (
          <li className={`${styles.item} ${styles.itemEmpty}`}>
            <FolderOpen size={28} strokeWidth={1.5} className="icon-accent" aria-hidden="true" />
            <span>{isGM ? t('room:scenes.noScenesGM') : t('room:scenes.noScenesPlayer')}</span>
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

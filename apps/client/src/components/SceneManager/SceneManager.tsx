import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadScenes, activateScene } from '../../store/scenes';
import CreateSceneModal from './CreateSceneModal';

interface SceneManagerProps {
  roomId: string;
  myRole: Role;
}

export default function SceneManager({ roomId, myRole }: SceneManagerProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common']);
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
    <section className="scene-manager">
      <div className="scene-manager__header">
        <h3>{t('room:scenes.heading')}</h3>
        {isGM && (
          <button
            type="button"
            className="btn-add-scene"
            onClick={() => setShowCreate(true)}
          >
            {t('room:scenes.createBtn')}
          </button>
        )}
      </div>

      {status === 'loading' && (
        <p className="scene-manager__status">{t('common:status.loading')}</p>
      )}
      {status === 'error' && (
        <p className="scene-manager__status scene-manager__status--error">{error}</p>
      )}

      <ul className="scene-list">
        {list.map((scene: SceneDTO) => (
          <li key={scene.id} className="scene-item">
            <span className="scene-item__name">{scene.name}</span>
            {scene.isActive && (
              <span
                className="scene-item__badge scene-item__badge--active"
                title={t('room:scenes.currentActiveBadgeTitle')}
              >
                {t('room:scenes.activeBadge')}
              </span>
            )}
            {isGM && (
              <button
                type="button"
                className="btn-activate"
                disabled={scene.isActive || activating === scene.id}
                title={scene.isActive ? t('room:scenes.alreadyActive') : t('room:scenes.makeActive')}
                onClick={() => void handleActivate(scene.id)}
              >
                {activating === scene.id ? t('room:scenes.activating') : t('room:scenes.activateBtn')}
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && status === 'idle' && (
          <li className="scene-item scene-item--empty">
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

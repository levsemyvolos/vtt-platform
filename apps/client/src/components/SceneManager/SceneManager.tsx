import { useEffect, useState } from 'react';
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
        <h3>Сцени</h3>
        {isGM && (
          <button
            type="button"
            className="btn-add-scene"
            onClick={() => setShowCreate(true)}
          >
            + Створити сцену
          </button>
        )}
      </div>

      {status === 'loading' && (
        <p className="scene-manager__status">Завантаження…</p>
      )}
      {status === 'error' && (
        <p className="scene-manager__status scene-manager__status--error">{error}</p>
      )}

      <ul className="scene-list">
        {list.map((scene: SceneDTO) => (
          <li key={scene.id} className="scene-item">
            <span className="scene-item__name">{scene.name}</span>
            {scene.isActive && (
              <span className="scene-item__badge scene-item__badge--active" title="Поточна активна сцена">
                Активна
              </span>
            )}
            {isGM && (
              <button
                type="button"
                className="btn-activate"
                disabled={scene.isActive || activating === scene.id}
                title={scene.isActive ? 'Ця сцена вже активна' : 'Зробити активною'}
                onClick={() => void handleActivate(scene.id)}
              >
                {activating === scene.id ? '…' : 'Активувати'}
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && status === 'idle' && (
          <li className="scene-item scene-item--empty">
            {isGM ? 'Сцен немає — створіть першу!' : 'Сцен ще немає.'}
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

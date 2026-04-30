import { useEffect } from 'react';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  bindTrackToScene,
  loadAudioTracks,
  removeAudioTrack,
  setTrackLoop,
  setVolume,
} from '../../store/audio';
import TrackUpload from './TrackUpload';

interface AudioPanelProps {
  roomId: string;
  sceneId: string | null;
  myRole: Role;
}

/**
 * GM control surface for music tracks (Ф6.1 + Ф6.3). Players see a read-only
 * list and the volume slider; only GM may upload, bind, set loop or delete
 * (RBAC §2.18).
 */
export default function AudioPanel({ roomId, sceneId, myRole }: AudioPanelProps): JSX.Element {
  const dispatch = useAppDispatch();
  const tracks = useAppSelector((s) => s.audio.tracks);
  const current = useAppSelector((s) => s.audio.current);
  const volume = useAppSelector((s) => s.audio.volume);

  useEffect(() => {
    void dispatch(loadAudioTracks(roomId));
  }, [roomId, dispatch]);

  const isGM = myRole === 'GM';
  const currentTrackId = current && current.action !== 'stop' ? current.trackId : null;

  return (
    <section className="audio-panel" aria-label="Музичні треки">
      <header className="audio-panel__header">
        <h3>Музика</h3>
        <label className="audio-panel__volume">
          Гучність
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => dispatch(setVolume(Number(e.target.value)))}
          />
        </label>
      </header>

      {isGM && <TrackUpload roomId={roomId} sceneId={sceneId} />}

      {tracks.length === 0 ? (
        <p className="audio-panel__empty">Треків ще немає.</p>
      ) : (
        <ul className="audio-panel__list">
          {tracks.map((t) => {
            const isPlaying = t.id === currentTrackId;
            const isBoundHere = sceneId !== null && t.sceneId === sceneId;
            return (
              <li
                key={t.id}
                className={`audio-panel__item${isPlaying ? ' is-playing' : ''}`}
              >
                <span className="audio-panel__title">{t.title}</span>
                {t.loop && <span className="audio-panel__badge">loop</span>}
                {isPlaying && <span className="audio-panel__badge is-active">▶</span>}
                {isGM && (
                  <div className="audio-panel__controls">
                    <button
                      type="button"
                      onClick={() =>
                        dispatch(
                          bindTrackToScene({
                            trackId: t.id,
                            sceneId: isBoundHere ? null : sceneId,
                          }),
                        )
                      }
                      disabled={!sceneId}
                      title={
                        !sceneId
                          ? 'Активна сцена відсутня'
                          : isBoundHere
                            ? 'Відв\'язати від сцени'
                            : 'Прив\'язати до активної сцени'
                      }
                    >
                      {isBoundHere ? '✕ scene' : 'bind'}
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(setTrackLoop({ trackId: t.id, loop: !t.loop }))}
                      title="Перемкнути loop"
                    >
                      {t.loop ? '∞ on' : '∞ off'}
                    </button>
                    <button
                      type="button"
                      className="audio-panel__delete"
                      onClick={() => dispatch(removeAudioTrack(t.id))}
                      aria-label={`Видалити трек ${t.title}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

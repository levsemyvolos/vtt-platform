import { useEffect, useState } from 'react';
import type { AudioTrackDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  bindTrackToScene,
  loadAudioTracks,
  patchTrackThunk,
  removeAudioTrack,
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
 * list and the volume slider; only GM may upload, bind, set loop, edit fadeMs
 * or delete (RBAC §2.18).
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
          {tracks.map((t) => (
            <TrackItem
              key={t.id}
              track={t}
              sceneId={sceneId}
              isGM={isGM}
              isPlaying={t.id === currentTrackId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface TrackItemProps {
  track: AudioTrackDTO;
  sceneId: string | null;
  isGM: boolean;
  isPlaying: boolean;
}

function TrackItem({ track, sceneId, isGM, isPlaying }: TrackItemProps): JSX.Element {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [editFadeMs, setEditFadeMs] = useState(track.fadeMs);
  const [editLoop, setEditLoop] = useState(track.loop);
  const [busy, setBusy] = useState(false);

  const isBoundHere = sceneId !== null && track.sceneId === sceneId;

  function onOpenEdit(): void {
    setEditFadeMs(track.fadeMs);
    setEditLoop(track.loop);
    setEditing(true);
  }

  async function onSaveEdit(): Promise<void> {
    setBusy(true);
    try {
      await dispatch(
        patchTrackThunk({ trackId: track.id, fadeMs: editFadeMs, loop: editLoop }),
      ).unwrap();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`audio-panel__item${isPlaying ? ' is-playing' : ''}`}>
      <span className="audio-panel__title">{track.title}</span>
      {track.loop && <span className="audio-panel__badge">loop</span>}
      {isPlaying && <span className="audio-panel__badge is-active">▶</span>}

      {isGM && !editing && (
        <div className="audio-panel__controls">
          <button
            type="button"
            onClick={() =>
              dispatch(bindTrackToScene({ trackId: track.id, sceneId: isBoundHere ? null : sceneId }))
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
          <button type="button" onClick={onOpenEdit} aria-label={`Редагувати ${track.title}`}>
            ✎ Edit
          </button>
          <button
            type="button"
            className="audio-panel__delete"
            onClick={() => dispatch(removeAudioTrack(track.id))}
            aria-label={`Видалити трек ${track.title}`}
          >
            ×
          </button>
        </div>
      )}

      {isGM && editing && (
        <div className="audio-panel__edit">
          <label>
            Loop
            <input
              type="checkbox"
              checked={editLoop}
              onChange={(e) => setEditLoop(e.target.checked)}
            />
          </label>
          <label>
            Fade {editFadeMs} мс
            <input
              type="range"
              min={0}
              max={5000}
              step={100}
              value={editFadeMs}
              onChange={(e) => setEditFadeMs(Number(e.target.value))}
              aria-label="Тривалість fade-in/out"
            />
          </label>
          <button type="button" onClick={onSaveEdit} disabled={busy}>Зберегти</button>
          <button type="button" onClick={() => setEditing(false)} disabled={busy}>Скасувати</button>
        </div>
      )}
    </li>
  );
}

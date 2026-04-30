import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export default function AudioPanel({ roomId, sceneId, myRole }: AudioPanelProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
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
    <section className="audio-panel" aria-label={t('campaign:audio.panelAriaLabel')}>
      <header className="audio-panel__header">
        <h3>{t('campaign:audio.heading')}</h3>
        <label className="audio-panel__volume">
          {t('campaign:audio.volume')}
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
        <p className="audio-panel__empty">{t('campaign:audio.empty')}</p>
      ) : (
        <ul className="audio-panel__list">
          {tracks.map((tr) => (
            <TrackItem
              key={tr.id}
              track={tr}
              sceneId={sceneId}
              isGM={isGM}
              isPlaying={tr.id === currentTrackId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function computeTrackBound(sceneId: string | null, trackSceneId: string | null): boolean {
  return sceneId !== null && trackSceneId === sceneId;
}

interface TrackItemProps {
  track: AudioTrackDTO;
  sceneId: string | null;
  isGM: boolean;
  isPlaying: boolean;
}

function TrackItem({ track, sceneId, isGM, isPlaying }: TrackItemProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [editFadeMs, setEditFadeMs] = useState(track.fadeMs);
  const [editLoop, setEditLoop] = useState(track.loop);
  const [busy, setBusy] = useState(false);

  const isBoundHere = computeTrackBound(sceneId, track.sceneId);
  const liClassName = `audio-panel__item${isPlaying ? ' is-playing' : ''}`;
  const bindTitle = sceneId
    ? isBoundHere
      ? t('campaign:audio.unbindTitle')
      : t('campaign:audio.bindTitle')
    : t('campaign:audio.noScene');
  const bindLabel = isBoundHere ? t('campaign:audio.unbindBtn') : t('campaign:audio.bindBtn');

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
    <li className={liClassName}>
      <span className="audio-panel__title">{track.title}</span>
      {track.loop && (
        <span className="audio-panel__badge">{t('campaign:audio.loopBadge')}</span>
      )}
      {isPlaying && <span className="audio-panel__badge is-active">▶</span>}

      {isGM && !editing && (
        <div className="audio-panel__controls">
          <button
            type="button"
            onClick={() =>
              dispatch(bindTrackToScene({ trackId: track.id, sceneId: isBoundHere ? null : sceneId }))
            }
            disabled={!sceneId}
            title={bindTitle}
          >
            {bindLabel}
          </button>
          <button
            type="button"
            onClick={onOpenEdit}
            aria-label={t('campaign:audio.editAriaLabel', { title: track.title })}
          >
            {t('campaign:audio.editBtn')}
          </button>
          <button
            type="button"
            className="audio-panel__delete"
            onClick={() => dispatch(removeAudioTrack(track.id))}
            aria-label={t('campaign:audio.deleteAriaLabel', { title: track.title })}
          >
            ×
          </button>
        </div>
      )}

      {isGM && editing && (
        <div className="audio-panel__edit">
          <label>
            {t('campaign:audio.loopLabel')}
            <input
              type="checkbox"
              checked={editLoop}
              onChange={(e) => setEditLoop(e.target.checked)}
            />
          </label>
          <label>
            {t('campaign:audio.fadeLabel', { ms: editFadeMs })}
            <input
              type="range"
              min={0}
              max={5000}
              step={100}
              value={editFadeMs}
              onChange={(e) => setEditFadeMs(Number(e.target.value))}
              aria-label={t('campaign:audio.fadeAriaLabel')}
            />
          </label>
          <button type="button" onClick={() => void onSaveEdit()} disabled={busy}>
            {t('common:btn.save')}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={busy}>
            {t('common:btn.cancel')}
          </button>
        </div>
      )}
    </li>
  );
}

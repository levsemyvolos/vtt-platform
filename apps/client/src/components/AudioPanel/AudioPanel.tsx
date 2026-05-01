import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Link2, Link2Off, Settings, Trash2 } from 'lucide-react';
import type { AudioTrackDTO, Role } from '@vtt/shared';
import styles from './AudioPanel.module.css';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  bindTrackToScene,
  loadAudioTracks,
  patchTrackThunk,
  removeAudioTrack,
  setVolume,
} from '../../store/audio';
import TrackUpload from './TrackUpload';
import { Button, IconButton } from '../ui';

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
    <section className={styles.panel} aria-label={t('campaign:audio.panelAriaLabel')}>
      <header className={styles.header}>
        <span className={`eyebrow ${styles.eyebrow}`}>
          {t('campaign:audio.heading')} · СЦЕНА
        </span>
        <label className={styles.volume}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => dispatch(setVolume(Number(e.target.value)))}
            aria-label={t('campaign:audio.volume')}
            className={styles.slider}
          />
        </label>
      </header>

      {isGM && <TrackUpload roomId={roomId} sceneId={sceneId} />}

      {tracks.length === 0 ? (
        <p className={styles.empty}>{t('campaign:audio.empty')}</p>
      ) : (
        <ul className={styles.list}>
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

function computeBindTitle(
  sceneId: string | null,
  isBoundHere: boolean,
  labels: { noScene: string; bind: string; unbind: string },
): string {
  if (!sceneId) return labels.noScene;
  return isBoundHere ? labels.unbind : labels.bind;
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
  const liClassName = isPlaying ? `${styles.item} ${styles.itemPlaying}` : styles.item;
  const bindTitle = computeBindTitle(sceneId, isBoundHere, {
    noScene: t('campaign:audio.noScene'),
    bind: t('campaign:audio.bindTitle'),
    unbind: t('campaign:audio.unbindTitle'),
  });

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
      <span className={styles.playIcon} aria-hidden="true">
        {isPlaying
          ? <Pause size={14} style={{ color: 'var(--color-primary)' }} />
          : <Play size={14} style={{ color: 'var(--color-text-muted)' }} />
        }
      </span>
      <span className={styles.trackTitle}>{track.title}</span>
      {track.loop && (
        <span className={styles.badge}>{t('campaign:audio.loopBadge')}</span>
      )}

      {isGM && !editing && (
        <div className={styles.controls}>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() =>
              dispatch(bindTrackToScene({ trackId: track.id, sceneId: isBoundHere ? null : sceneId }))
            }
            disabled={!sceneId}
            title={bindTitle}
            aria-label={bindTitle}
          >
            {isBoundHere
              ? <Link2Off size={14} style={{ color: 'var(--color-primary)' }} />
              : <Link2 size={14} />
            }
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onOpenEdit}
            aria-label={t('campaign:audio.editAriaLabel', { title: track.title })}
          >
            <Settings size={14} />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => dispatch(removeAudioTrack(track.id))}
            aria-label={t('campaign:audio.deleteAriaLabel', { title: track.title })}
          >
            <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
          </IconButton>
        </div>
      )}

      {isGM && editing && (
        <div className={styles.editRow}>
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
              className={styles.slider}
            />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onSaveEdit()} disabled={busy}>
            {t('common:btn.save')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
            {t('common:btn.cancel')}
          </Button>
        </div>
      )}
    </li>
  );
}

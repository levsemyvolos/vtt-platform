import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Link2, Link2Off, Settings, Trash2 } from 'lucide-react';
import type { AudioTrackDTO, AudioLayer } from '@vtt/shared';
import styles from './AudioPanel.module.css';
import { useAppDispatch } from '../../store';
import { bindTrackToScene, patchTrackThunk, removeAudioTrack, playTrackThunk, stopLayerThunk } from '../../store/audio';
import { Button, IconButton } from '../ui';

export interface TrackItemProps {
  track: AudioTrackDTO;
  /** Current room id — required for stopLayerThunk. */
  roomId: string;
  sceneId: string | null;
  isGM: boolean;
  isPlaying: boolean;
  /** Variant: sfx tracks show only one-shot Play + Edit + Delete. */
  isSfx: boolean;
}

interface EditDraft {
  fadeMs: number;
  loop: boolean;
  layer: AudioLayer;
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

export default function TrackItem({ track, roomId, sceneId, isGM, isPlaying, isSfx }: TrackItemProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    fadeMs: track.fadeMs, loop: track.loop, layer: track.layer,
  });

  const liClassName = isPlaying ? `${styles.item} ${styles.itemPlaying}` : styles.item;

  function openEdit(): void {
    setDraft({ fadeMs: track.fadeMs, loop: track.loop, layer: track.layer });
    setEditing(true);
  }

  function handlePlayStop(): void {
    if (isSfx) {
      void dispatch(playTrackThunk(track.id));
      return;
    }
    if (isPlaying) {
      void dispatch(stopLayerThunk({ roomId, layer: track.layer as 'music' | 'ambient' }));
    } else {
      void dispatch(playTrackThunk(track.id));
    }
  }

  const playLabel = isPlaying
    ? t('campaign:audio.stopAriaLabel', { title: track.title, defaultValue: 'Stop {{title}}' })
    : t('campaign:audio.playAriaLabel', { title: track.title, defaultValue: 'Play {{title}}' });

  return (
    <li className={liClassName}>
      <IconButton
        variant="ghost"
        size="sm"
        onClick={handlePlayStop}
        aria-label={playLabel}
        className={styles.playIcon}
      >
        {isPlaying
          ? <Pause size={14} style={{ color: 'var(--color-primary)' }} />
          : <Play size={14} style={{ color: 'var(--color-text-muted)' }} />
        }
      </IconButton>
      <span className={styles.trackTitle}>{track.title}</span>
      {!isSfx && track.loop && (
        <span className={styles.badge}>{t('campaign:audio.loopBadge')}</span>
      )}

      {isGM && !editing && (
        <ReadControls track={track} sceneId={sceneId} isSfx={isSfx} onOpenEdit={openEdit} />
      )}

      {isGM && editing && (
        <EditControls
          track={track}
          isSfx={isSfx}
          draft={draft}
          onDraftChange={setDraft}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  );
}

interface ReadControlsProps {
  track: AudioTrackDTO;
  sceneId: string | null;
  isSfx: boolean;
  onOpenEdit: () => void;
}

function ReadControls({ track, sceneId, isSfx, onOpenEdit }: ReadControlsProps): JSX.Element {
  const { t } = useTranslation(['campaign']);
  const dispatch = useAppDispatch();
  const isBoundHere = computeTrackBound(sceneId, track.sceneId);
  const bindTitle = computeBindTitle(sceneId, isBoundHere, {
    noScene: t('campaign:audio.noScene'),
    bind: t('campaign:audio.bindTitle'),
    unbind: t('campaign:audio.unbindTitle'),
  });
  return (
    <div className={styles.controls}>
      {!isSfx && (
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
      )}
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
  );
}

interface EditControlsProps {
  track: AudioTrackDTO;
  isSfx: boolean;
  draft: EditDraft;
  onDraftChange: (next: EditDraft) => void;
  onClose: () => void;
}

function EditControls({ track, isSfx, draft, onDraftChange, onClose }: EditControlsProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  async function onSave(): Promise<void> {
    setBusy(true);
    try {
      await dispatch(
        patchTrackThunk({
          trackId: track.id, fadeMs: draft.fadeMs, loop: draft.loop, layer: draft.layer,
        }),
      ).unwrap();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.editRow}>
      {!isSfx && (
        <>
          <label>
            {t('campaign:audio.loopLabel')}
            <input
              type="checkbox"
              checked={draft.loop}
              onChange={(e) => onDraftChange({ ...draft, loop: e.target.checked })}
            />
          </label>
          <label>
            {t('campaign:audio.fadeLabel', { ms: draft.fadeMs })}
            <input
              type="range"
              min={0}
              max={5000}
              step={100}
              value={draft.fadeMs}
              onChange={(e) => onDraftChange({ ...draft, fadeMs: Number(e.target.value) })}
              aria-label={t('campaign:audio.fadeAriaLabel')}
              className={styles.slider}
            />
          </label>
        </>
      )}
      <label>
        {t('campaign:audio.layerLabel', { defaultValue: 'Layer' })}
        <select
          value={draft.layer}
          onChange={(e) => onDraftChange({ ...draft, layer: e.target.value as AudioLayer })}
        >
          <option value="music">Music</option>
          <option value="ambient">Ambient</option>
          <option value="sfx">SFX</option>
        </select>
      </label>
      <Button type="button" variant="secondary" size="sm" onClick={() => void onSave()} disabled={busy}>
        {t('common:btn.save')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
        {t('common:btn.cancel')}
      </Button>
    </div>
  );
}

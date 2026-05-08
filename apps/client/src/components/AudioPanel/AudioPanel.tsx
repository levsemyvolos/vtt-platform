import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioTrackDTO, Role, AudioLayer } from '@vtt/shared';
import { ALL_AUDIO_LAYERS } from '@vtt/shared';
import styles from './AudioPanel.module.css';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadAudioTracks } from '../../store/audio';
import TrackUpload from './TrackUpload';
import VolumeMixer from './VolumeMixer';
import TrackItem from './TrackItem';

interface AudioPanelProps {
  roomId: string;
  sceneId: string | null;
  myRole: Role;
}

type GroupedTracks = Record<AudioLayer, AudioTrackDTO[]>;

export default function AudioPanel({ roomId, sceneId, myRole }: AudioPanelProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  const dispatch = useAppDispatch();
  const tracks = useAppSelector((s) => s.audio.tracks);
  const current = useAppSelector((s) => s.audio.current);

  useEffect(() => {
    void dispatch(loadAudioTracks(roomId));
  }, [roomId, dispatch]);

  const isGM = myRole === 'GM';

  const grouped = useMemo<GroupedTracks>(() => {
    const out: GroupedTracks = { music: [], ambient: [], sfx: [] };
    for (const tr of tracks) out[tr.layer].push(tr);
    return out;
  }, [tracks]);

  return (
    <section className={styles.panel} aria-label={t('campaign:audio.panelAriaLabel')}>
      <header className={styles.header}>
        <span className={`eyebrow ${styles.eyebrow}`}>
          {t('campaign:audio.heading')}
        </span>
      </header>

      <VolumeMixer />

      {ALL_AUDIO_LAYERS.map((layer) => (
        <LayerSection
          key={layer}
          layer={layer}
          tracks={grouped[layer]}
          sceneId={sceneId}
          isGM={isGM}
          roomId={roomId}
          currentTrackId={resolveCurrentTrackId(layer, current)}
        />
      ))}
    </section>
  );
}

/** Derive the currently-playing trackId for a given layer (null for SFX). */
function resolveCurrentTrackId(
  layer: AudioLayer,
  current: { music: import('@vtt/shared').AudioPlayPayload | null; ambient: import('@vtt/shared').AudioPlayPayload | null },
): string | null {
  if (layer === 'sfx') return null;
  const p = current[layer];
  if (!p) return null;
  if (p.kind === 'persistent' && p.action !== 'stop') return p.trackId;
  return null;
}

// ── LayerSection ────────────────────────────────────────────────────────────

interface LayerSectionProps {
  layer: AudioLayer;
  tracks: AudioTrackDTO[];
  sceneId: string | null;
  isGM: boolean;
  roomId: string;
  currentTrackId: string | null;
}

function LayerSection({
  layer,
  tracks,
  sceneId,
  isGM,
  roomId,
  currentTrackId,
}: LayerSectionProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const [collapsed, setCollapsed] = useState(false);
  const isSfx = layer === 'sfx';

  return (
    <div className={styles.layerSection}>
      <div className={styles.layerHeader}>
        <button
          type="button"
          className={styles.layerToggle}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <h3 className={styles.layerTitle}>{t(`audio.layer.${layer}`)}</h3>
          <span className={styles.badge}>{tracks.length}</span>
        </button>
      </div>

      {!collapsed && (
        <div className={styles.layerBody}>
          {isGM && (
            <TrackUpload roomId={roomId} sceneId={sceneId} layer={layer} />
          )}

          {tracks.length === 0 ? (
            <p className={styles.empty}>{t('audio.layer.empty')}</p>
          ) : (
            <ul className={styles.list}>
              {tracks.map((tr) => (
                <TrackItem
                  key={tr.id}
                  track={tr}
                  roomId={roomId}
                  sceneId={sceneId}
                  isGM={isGM}
                  isPlaying={tr.id === currentTrackId}
                  isSfx={isSfx}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

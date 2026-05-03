import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import { apiFetch } from '../../api/apiFetch';
import styles from './RecentGenerations.module.css';

interface RecentGenerationsProps {
  roomId: string;
}

export default function RecentGenerations({ roomId }: RecentGenerationsProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [images, setImages] = useState<AssetDTO[]>([]);
  const [audioTracks, setAudioTracks] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeAudio, setActiveAudio] = useState<AssetDTO | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    Promise.all([
      apiFetch<AssetDTO[]>(`/api/assets?roomId=${roomId}&type=image`),
      apiFetch<AssetDTO[]>(`/api/assets?roomId=${roomId}&type=audio`),
    ])
      .then(([imgs, audio]) => {
        // Show most recent 6 images and 5 audio tracks
        setImages(imgs.slice(0, 6));
        setAudioTracks(audio.slice(0, 5));
      })
      .catch(() => {
        // Silently fail — panel is informational
      })
      .finally(() => {
        setLoading(false);
      });
  }, [roomId]);

  return (
    <aside className={styles.recentGenerations}>
      <p className={styles.sectionHeading}>{t('recent.heading')}</p>
      <div className={styles.thumbnails}>
        {loading && <p className={styles.empty}>{t('recent.loading', 'Loading...')}</p>}
        {!loading && images.length === 0 && (
          <p className={styles.empty}>{t('recent.emptyImages')}</p>
        )}
        {!loading && images.map((img) => (
          <img
            key={img.id}
            src={img.url}
            alt={img.name}
            title={img.name}
            style={{
              width: '100%',
              aspectRatio: '1',
              objectFit: 'cover',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
            }}
            onClick={() => window.open(img.url, '_blank', 'noopener,noreferrer')}
          />
        ))}
      </div>

      <div className={styles.audioPlayer}>
        <p className={styles.sectionHeading}>{t('recent.playerHeading')}</p>
        {audioTracks.length === 0 && !loading && (
          <p className={styles.empty}>{t('recent.emptyAudio', 'No generated music yet')}</p>
        )}
        {audioTracks.map((track) => (
          <div key={track.id} style={{ marginBottom: 'var(--space-xs)' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track.name}
            </p>
            {activeAudio?.id === track.id ? (
              <audio
                controls
                autoPlay
                src={track.url}
                style={{ width: '100%', height: 28 }}
                onEnded={() => setActiveAudio(null)}
              />
            ) : (
              <div className={styles.playerControls}>
                <button
                  type="button"
                  className={styles.playerBtn}
                  aria-label={t('recent.playBtn')}
                  onClick={() => setActiveAudio(track)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                    <polygon points="2,1 13,7 2,13" />
                  </svg>
                </button>
                <div
                  className={styles.scrubBar}
                  role="progressbar"
                  aria-label={t('recent.scrubBar')}
                  aria-valuenow={0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className={styles.scrubFill} style={{ width: '0%' }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.quota}>
        <p className={styles.sectionHeading}>{t('recent.quotaHeading')}</p>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaLlm')}</span>
          <span className={styles.quotaValue}>—</span>
        </div>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaImages')}</span>
          <span className={styles.quotaValue}>{images.length}</span>
        </div>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaMusic')}</span>
          <span className={styles.quotaValue}>{audioTracks.length}</span>
        </div>
      </div>
    </aside>
  );
}

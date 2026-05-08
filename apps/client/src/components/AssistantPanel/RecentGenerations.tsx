import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import type { AIQuotaResponse } from '@vtt/shared';
import { listAiAssets } from '../../api/assets';
import { getAIQuota } from '../../api/ai';
import styles from './RecentGenerations.module.css';

interface RecentGenerationsProps {
  roomId: string;
}

const IMAGE_DISPLAY_LIMIT = 6;
const AUDIO_DISPLAY_LIMIT = 5;

export default function RecentGenerations({ roomId }: RecentGenerationsProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [images, setImages] = useState<AssetDTO[]>([]);
  const [audioTracks, setAudioTracks] = useState<AssetDTO[]>([]);
  const [quota, setQuota] = useState<AIQuotaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAudio, setActiveAudio] = useState<AssetDTO | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    Promise.all([
      listAiAssets(roomId, 'image'),
      listAiAssets(roomId, 'audio'),
      getAIQuota(roomId).catch(() => null),
    ])
      .then(([imgs, audio, q]) => {
        setImages(imgs.slice(0, IMAGE_DISPLAY_LIMIT));
        setAudioTracks(audio.slice(0, AUDIO_DISPLAY_LIMIT));
        setQuota(q);
      })
      .catch(() => {
        // Silently fail — panel is informational
      })
      .finally(() => setLoading(false));
  }, [roomId]);

  function copyPrompt(asset: AssetDTO): void {
    if (!asset.aiPrompt) return;
    void navigator.clipboard.writeText(asset.aiPrompt).then(() => {
      setCopied(asset.id);
      setTimeout(() => setCopied((cur) => (cur === asset.id ? null : cur)), 1500);
    });
  }

  return (
    <aside className={styles.recentGenerations}>
      <p className={styles.sectionHeading}>{t('recent.heading')}</p>
      <div className={styles.thumbnails}>
        {loading && <p className={styles.empty}>{t('recent.loading')}</p>}
        {!loading && images.length === 0 && (
          <p className={styles.empty}>{t('recent.emptyImages')}</p>
        )}
        {!loading && images.map((img) => (
          <div key={img.id} className={styles.thumbCell}>
            <img
              src={img.url}
              alt={img.aiPrompt ?? img.name}
              title={img.aiPrompt ?? img.name}
              className={styles.thumbImg}
              onClick={() => window.open(img.url, '_blank', 'noopener,noreferrer')}
            />
            {img.aiPrompt && (
              <button
                type="button"
                className={styles.copyPromptBtn}
                onClick={() => copyPrompt(img)}
                aria-label={t('recent.copyPrompt')}
                title={img.aiPrompt}
              >
                {copied === img.id ? '✓' : '📋'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className={styles.audioPlayer}>
        <p className={styles.sectionHeading}>{t('recent.playerHeading')}</p>
        {!loading && audioTracks.length === 0 && (
          <p className={styles.empty}>{t('recent.emptyAudio')}</p>
        )}
        {audioTracks.map((track) => (
          <div key={track.id} className={styles.audioRow}>
            <p className={styles.audioLabel} title={track.aiPrompt ?? track.name}>
              {track.aiPrompt
                ? (track.aiPrompt.length > 40 ? `${track.aiPrompt.slice(0, 40)}…` : track.aiPrompt)
                : track.name}
            </p>
            {activeAudio?.id === track.id ? (
              <audio
                controls
                autoPlay
                src={track.url}
                className={styles.audioPlayerEl}
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
          <span className={styles.quotaValue}>
            {quota ? `${quota.llm.messagesLast24h} / 24h` : '—'}
          </span>
        </div>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaImages')}</span>
          <span className={styles.quotaValue}>
            {quota ? `${quota.images.last24h} / 24h · ${quota.images.total} ${t('recent.quotaTotal')}` : '—'}
          </span>
        </div>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaMusic')}</span>
          <span className={styles.quotaValue}>
            {quota ? `${quota.audio.last24h} / 24h · ${quota.audio.total} ${t('recent.quotaTotal')}` : '—'}
          </span>
        </div>
      </div>
    </aside>
  );
}

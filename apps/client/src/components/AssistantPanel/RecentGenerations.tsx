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

/**
 * S5.5 P2 — audio rows removed.
 *
 * Audio history was previously duplicated here as a "quick player" strip.
 * The duplicate confused the model: history lived in two surfaces (this
 * sidebar + MusicHistoryList in the assistant panel) but Save / Play /
 * Rename actions only existed on one. Per option B from the S5.5 plan,
 * MusicHistoryList becomes the single source of truth for audio, and
 * this sidebar focuses on images + quota meters.
 */
export default function RecentGenerations({ roomId }: RecentGenerationsProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [images, setImages] = useState<AssetDTO[]>([]);
  const [quota, setQuota] = useState<AIQuotaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    Promise.all([
      listAiAssets(roomId, 'image'),
      getAIQuota(roomId).catch(() => null),
    ])
      .then(([imgs, q]) => {
        setImages(imgs.slice(0, IMAGE_DISPLAY_LIMIT));
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

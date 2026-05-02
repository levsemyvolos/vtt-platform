import { useTranslation } from 'react-i18next';
import styles from './RecentGenerations.module.css';

export default function RecentGenerations(): JSX.Element {
  const { t } = useTranslation('assistant');

  return (
    <aside className={styles.recentGenerations}>
      <p className={styles.sectionHeading}>{t('recent.heading')}</p>
      <div className={styles.thumbnails}>
        <p className={styles.empty}>{t('recent.emptyImages')}</p>
      </div>

      <div className={styles.audioPlayer}>
        <p className={styles.sectionHeading}>{t('recent.playerHeading')}</p>
        <div className={styles.playerControls}>
          <button type="button" className={styles.playerBtn} aria-label={t('recent.playBtn')}>
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
      </div>

      <div className={styles.quota}>
        <p className={styles.sectionHeading}>{t('recent.quotaHeading')}</p>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaLlm')}</span>
          <span className={styles.quotaValue}>—</span>
        </div>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaImages')}</span>
          <span className={styles.quotaValue}>—</span>
        </div>
        <div className={styles.quotaItem}>
          <span className={styles.quotaLabel}>{t('recent.quotaMusic')}</span>
          <span className={styles.quotaValue}>—</span>
        </div>
      </div>
    </aside>
  );
}

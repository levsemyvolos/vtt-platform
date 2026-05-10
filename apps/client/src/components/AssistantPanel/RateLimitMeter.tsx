import { useTranslation } from 'react-i18next';
import styles from './RateLimitMeter.module.css';

const RATE_LIMIT_MINUTE = 9; // TODO(P5.3): receive from X-RateLimit-Limit header

interface Props {
  remaining: number;
}

export default function RateLimitMeter({ remaining }: Props): JSX.Element {
  const { t } = useTranslation('assistant');
  const limit = RATE_LIMIT_MINUTE;
  const fill = Math.max(0, Math.min(1, remaining / limit));
  const low = fill <= 0.3;

  return (
    <div
      className={styles.meter}
      aria-label={t('header.rateLimit.aria', { remaining })}
      title={t('header.rateLimit.tooltip')}
    >
      <div className={styles.meterHeader}>
        <span className={styles.meterEyebrow}>RATE LIMIT · THIS MINUTE</span>
        <span className={`${styles.meterValue} ${low ? styles.meterValueLow : ''}`}>
          {remaining}/{limit}
        </span>
      </div>
      <div className={styles.meterTrack}>
        <div
          className={`${styles.meterBar} ${low ? styles.meterBarLow : ''}`}
          style={{ '--fill': `${fill * 100}%` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

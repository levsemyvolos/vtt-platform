import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './BootstrapLoader.module.css';

interface BootstrapLoaderProps {
  /** When true the loader was triggered by a network error (not a cold start). */
  networkError?: boolean;
  /** Called when the user clicks "Retry" — should re-dispatch bootstrapSession. */
  onRetry?: () => void;
}

/**
 * Progressive cold-start / bootstrap loader.
 *
 * Stages (Wave 3.2, MIN-001 / MIN-006):
 *  0–3 s   → spinner only
 *  3–15 s  → "Connecting to server..."
 *  15–45 s → "Server is waking up…"
 *  45+ s   → "Retry" button shown
 */
export default function BootstrapLoader({ networkError = false, onRetry }: BootstrapLoaderProps) {
  const { t } = useTranslation(['common', 'errors']);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const showConnecting = elapsed >= 3;
  const showWaking = elapsed >= 15;
  const showRetry = elapsed >= 45 || networkError;

  const message = showWaking
    ? t('common:loader.waking')
    : showConnecting
      ? t('common:loader.connecting')
      : null;

  return (
    <main className={styles.root} aria-busy="true" aria-label={t('common:loader.connecting')}>
      <div className={styles.inner}>
        <div className={styles.spinner} aria-hidden="true" />
        {message && <p className={styles.message}>{message}</p>}
        {showRetry && onRetry && (
          <button
            type="button"
            className={styles.retryBtn}
            onClick={onRetry}
          >
            {t('common:loader.retry')}
          </button>
        )}
      </div>
    </main>
  );
}

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { removeToast, type ToastVariant } from '../../store/toast';
import styles from './Toast.module.css';

const ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const AUTO_DISMISS_MS = 4000;

/** Global toast container — mount once in App root. */
export default function ToastContainer(): JSX.Element {
  const dispatch = useAppDispatch();
  const queue = useAppSelector((s) => s.toast.queue);
  const { t: translate } = useTranslation(['errors', 'common']);

  const renderMessage = (raw: string): string => {
    // Messages that come as i18n keys (`errors:foo.bar`) are translated here so
    // producers (apiFetch, thunks) don't need React context. Plain strings pass through.
    if (raw.startsWith('errors:') || raw.startsWith('common:')) return translate(raw as never);
    return raw;
  };

  useEffect(() => {
    const first = queue[0];
    if (!first) return;
    const timer = setTimeout(() => {
      dispatch(removeToast(first.id));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [queue, dispatch]);

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {queue.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`${styles.toast} ${styles[`toast--${t.variant}`]}`}
        >
          <span className={styles.icon} aria-hidden="true">{ICONS[t.variant]}</span>
          <span className={styles.message}>{renderMessage(t.message)}</span>
          <button
            type="button"
            className={styles.close}
            onClick={() => dispatch(removeToast(t.id))}
            aria-label="Закрити сповіщення"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

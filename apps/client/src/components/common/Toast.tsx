import { useEffect } from 'react';
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
          <span className={styles.message}>{t.message}</span>
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

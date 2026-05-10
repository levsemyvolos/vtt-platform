import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { removeToast, type ToastItem, type ToastVariant } from '../../store/toast';
import styles from './Toast.module.css';

const ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

// B5-MIN-002: variant-based durations (success 4.5 s, error 6.5 s, rest 5 s)
const DISMISS_MS: Record<ToastVariant, number> = {
  success: 4500,
  error: 6500,
  warning: 5000,
  info: 5000,
};

const LEAVE_DURATION_MS = 180;

/** Single toast item that auto-dismisses after its variant-specific delay. */
function ToastItemView({ item }: { item: ToastItem }): JSX.Element {
  const dispatch = useAppDispatch();
  const { t: translate } = useTranslation(['errors', 'common', 'room']);
  const [leaving, setLeaving] = useState(false);

  const renderMessage = (raw: string): string => {
    if (
      raw.startsWith('errors:') ||
      raw.startsWith('common:') ||
      raw.startsWith('room:')
    ) return translate(raw as never);
    return raw;
  };

  function startLeave(): void {
    setLeaving(true);
    setTimeout(() => {
      dispatch(removeToast(item.id));
    }, LEAVE_DURATION_MS);
  }

  // Each toast manages its own timer so they dismiss independently.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(startLeave, DISMISS_MS[item.variant]);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // startLeave is stable within the closure; item.id/variant are the keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.variant]);

  const variantClass = item.variant === 'error' ? 'alert' : 'status';

  return (
    <div
      role={variantClass === 'alert' ? 'alert' : 'status'}
      aria-live={variantClass === 'alert' ? 'assertive' : 'polite'}
      className={`${styles.toast} ${styles[`toast--${item.variant}`]}${leaving ? ` ${styles.leaving}` : ''}`}
    >
      <span className={styles.icon} aria-hidden="true">{ICONS[item.variant]}</span>
      <span className={styles.message}>
        {renderMessage(item.message)}
        {item.count && item.count > 1 ? <span className={styles.count}> ×{item.count}</span> : null}
      </span>
      <button
        type="button"
        className={styles.close}
        onClick={startLeave}
        aria-label="Закрити сповіщення"
      >
        ×
      </button>
    </div>
  );
}

/** Global toast container — mount once in App root. */
export default function ToastContainer(): JSX.Element {
  const queue = useAppSelector((s) => s.toast.queue);

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {queue.map((t) => (
        <ToastItemView key={t.id} item={t} />
      ))}
    </div>
  );
}

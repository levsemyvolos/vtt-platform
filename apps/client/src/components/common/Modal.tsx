import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  wide?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Generic modal: backdrop click + Esc to close, focus trap on open.
 * Usage: wrap any content that needs an overlay dialog.
 */
export default function Modal({ title, onClose, wide = false, icon, children }: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) onClose();
  }

  function handleDialogKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${styles.dialog}${wide ? ` ${styles['dialog--wide']}` : ''}`}
        onKeyDown={handleDialogKeyDown}
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {icon && <span className={styles.icon} aria-hidden>{icon}</span>}
            <h2 className={styles.title}>{title}</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Закрити діалог"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { Button } from '../ui';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  /** Pass false to hide the cancel button entirely (e.g. for info-only modals). */
  cancelLabel?: string | false;
  /** 'danger' styles the confirm button red; 'primary' uses brand color */
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  onConfirm,
  onClose,
  busy = false,
}: ConfirmModalProps): JSX.Element | null {
  const { t } = useTranslation('common');
  if (!open) return null;

  const resolvedConfirmLabel = confirmLabel ?? t('btn.confirm');
  const showCancel = cancelLabel !== false;
  const resolvedCancelLabel = typeof cancelLabel === 'string' ? cancelLabel : t('btn.cancel');

  return (
    <Modal title={title} onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {showCancel && (
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={busy}
              // For danger actions, default focus lands on Cancel to prevent accidental confirm.
              autoFocus={variant === 'danger'}
            >
              {resolvedCancelLabel}
            </Button>
          )}
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={busy}
            autoFocus={variant !== 'danger'}
          >
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

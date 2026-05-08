import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './InitiativeEntryContextMenu.module.css';

interface Props {
  x: number;
  y: number;
  hasToken: boolean;
  onEditEntry: () => void;
  onEditToken: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function InitiativeEntryContextMenu({
  x, y, hasToken, onEditEntry, onEditToken, onRemove, onClose,
}: Props): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      aria-label={t('initiative.contextMenuLabel', { defaultValue: 'Entry actions' })}
    >
      <button
        type="button"
        className={styles.item}
        role="menuitem"
        onClick={() => { onEditEntry(); onClose(); }}
      >
        {t('initiative.editEntry', { defaultValue: 'Edit entry' })}
      </button>
      <button
        type="button"
        className={styles.item}
        role="menuitem"
        onClick={() => { onEditToken(); onClose(); }}
        disabled={!hasToken}
        aria-disabled={!hasToken}
      >
        {t('initiative.editToken', { defaultValue: 'Edit token…' })}
      </button>
      <button
        type="button"
        className={`${styles.item} ${styles['item--danger']}`}
        role="menuitem"
        onClick={() => { onRemove(); onClose(); }}
      >
        {t('common:btn.remove', { defaultValue: 'Remove' })}
      </button>
    </div>
  );
}

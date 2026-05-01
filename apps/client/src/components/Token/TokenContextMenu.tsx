import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../store';
import { removeToken } from '../../store/scene';
import { apiDeleteToken } from '../../api/scenes';
import styles from './TokenContextMenu.module.css';

interface TokenContextMenuProps {
  tokenId: string;
  x: number;
  y: number;
  onEdit: () => void;
  onClose: () => void;
}

export default function TokenContextMenu({
  tokenId, x, y, onEdit, onClose,
}: TokenContextMenuProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common']);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  async function handleDelete(): Promise<void> {
    try {
      await apiDeleteToken(tokenId);
      dispatch(removeToken(tokenId));
    } catch {
      // server error — optimistic; resync will correct
    }
    onClose();
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      aria-label={t('room:token.contextMenuLabel')}
    >
      <button
        className={styles.item}
        role="menuitem"
        onClick={() => { onEdit(); onClose(); }}
      >
        {t('common:btn.edit')}
      </button>
      <button
        className={`${styles.item} ${styles['item--danger']}`}
        role="menuitem"
        onClick={() => void handleDelete()}
      >
        {t('common:btn.delete')}
      </button>
    </div>
  );
}

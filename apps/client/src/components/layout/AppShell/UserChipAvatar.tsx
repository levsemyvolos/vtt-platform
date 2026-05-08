import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../store';
import { logout } from '../../../store/session';
import styles from './UserChipAvatar.module.css';

interface MenuPos {
  left: number;
  top: number;
  minWidth: number;
}

export default function UserChipAvatar() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('common');
  const { currentUser } = useAppSelector((s) => s.session);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener('click', handle);
    return () => window.removeEventListener('click', handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    function updatePos(): void {
      const rect = btnRef.current!.getBoundingClientRect();
      setMenuPos({
        left: rect.right - 220,
        top: rect.bottom + 8,
        minWidth: 220,
      });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  if (!currentUser) return null;

  const initial = currentUser.name.charAt(0).toUpperCase();

  const handleLogout = () => {
    setOpen(false);
    void dispatch(logout());
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={styles.avatar}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={currentUser.name}
      >
        {initial}
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          style={{
            position: 'fixed',
            left: menuPos.left,
            top: menuPos.top,
            minWidth: menuPos.minWidth,
          }}
        >
          <div className={styles.menuHead}>
            <span className={styles.menuHeadName}>{currentUser.name}</span>
            <span className={styles.menuHeadEmail}>{currentUser.email}</span>
          </div>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            role="menuitem"
          >
            <LogOut size={16} aria-hidden="true" />
            <span>{t('btn.logout')}</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronUp, LogOut } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../store';
import { logout } from '../../../store/session';
import Avatar from '../../ui/Avatar';
import ThemeToggle from '../../Header/ThemeToggle';
import LanguageSwitcher from '../../Header/LanguageSwitcher';
import styles from './UserChip.module.css';

interface MenuPos {
  left: number;
  bottom: number;
  width: number;
}

export default function UserChip() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('common');
  const { currentUser } = useAppSelector((s) => s.session);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
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
    if (!open || !chipRef.current) return;
    function updatePos(): void {
      const rect = chipRef.current!.getBoundingClientRect();
      setMenuPos({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
        width: Math.max(rect.width, 220),
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

  const handleLogout = () => {
    setOpen(false);
    void dispatch(logout());
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={chipRef}
        type="button"
        className={styles.chip}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={currentUser.name} size="md" status="online" />
        <span className={styles.meta}>
          <span className={styles.name}>{currentUser.name}</span>
          <span className={styles.role}>{currentUser.email}</span>
        </span>
        <ChevronUp size={16} className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true" />
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          style={{
            position: 'fixed',
            left: menuPos.left,
            bottom: menuPos.bottom,
            minWidth: menuPos.width,
          }}
        >
          <div className={styles.menuHead}>
            <span className={styles.menuHeadName}>{currentUser.name}</span>
            <span className={styles.menuHeadEmail}>{currentUser.email}</span>
          </div>
          <div className={styles.menuRow}>
            <ThemeToggle />
          </div>
          <div className={styles.menuRow}>
            <LanguageSwitcher />
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

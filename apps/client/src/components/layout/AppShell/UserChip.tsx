import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, LogOut } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../store';
import { logout } from '../../../store/session';
import Avatar from '../../ui/Avatar';
import ThemeToggle from '../../Header/ThemeToggle';
import LanguageSwitcher from '../../Header/LanguageSwitcher';
import styles from './UserChip.module.css';

export default function UserChip() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['nav', 'common']);
  const { currentUser } = useAppSelector((s) => s.session);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!currentUser) return null;

  const handleLogout = () => {
    setOpen(false);
    void dispatch(logout());
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
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

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuRow}>
            <span className={styles.menuLabel}>{t('nav.menu.theme')}</span>
            <ThemeToggle />
          </div>
          <div className={styles.menuRow}>
            <span className={styles.menuLabel}>{t('nav.menu.language')}</span>
            <LanguageSwitcher />
          </div>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            role="menuitem"
          >
            <LogOut size={16} aria-hidden="true" />
            <span>{t('common:btn.logout')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

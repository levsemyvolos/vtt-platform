import { Layers, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from '../../ui/Logo';
import UserChip from './UserChip';
import styles from './LeftNav.module.css';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
}

export default function LeftNav() {
  const { t } = useTranslation('nav');

  const items: ReadonlyArray<NavItem> = [
    {
      id: 'rooms',
      label: t('nav.rooms'),
      icon: <Layers size={18} />,
      active: true,
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      icon: <Settings size={18} />,
      active: false,
      disabled: true,
    },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <Logo size={28} />
      </div>

      <nav className={styles.nav} role="navigation">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={[
              styles.item,
              it.active ? styles.active : '',
              it.disabled ? styles.disabled : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={it.disabled}
            aria-current={it.active ? 'page' : undefined}
            aria-disabled={it.disabled || undefined}
            title={it.disabled ? t('nav.comingSoon') : undefined}
          >
            <span className={styles.icon} aria-hidden="true">{it.icon}</span>
            <span className={styles.label}>{it.label}</span>
            {it.disabled && <span className={styles.hint}>{t('nav.comingSoonShort')}</span>}
          </button>
        ))}
      </nav>

      <div className={styles.spacer} />

      <UserChip />
    </div>
  );
}

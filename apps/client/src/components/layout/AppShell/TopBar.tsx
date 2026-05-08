import { useTranslation } from 'react-i18next';
import Logo from '../../ui/Logo';
import PingMeter from '../../ui/PingMeter';
import Badge from '../../ui/Badge';
import ThemeToggle from '../../Header/ThemeToggle';
import LanguageSwitcher from '../../Header/LanguageSwitcher';
import { useWebRTCStats } from '../../../hooks/useWebRTCStats';
import { useOnlineUsers } from '../../../hooks/useOnlineUsers';
import UserChipAvatar from './UserChipAvatar';
import styles from './TopBar.module.css';

export default function TopBar() {
  const { rtt } = useWebRTCStats();
  const { count: onlineCount } = useOnlineUsers();
  const { t } = useTranslation('common');

  return (
    <header className={styles.topbar} aria-label="Головна навігація">
      <a href="/" className={styles.brandLink} aria-label="Obscure VTT — на головну">
        <Logo size={40} withText />
      </a>
      <div className={styles.spacer} />
      <div className={styles.statusGroup}>
        {rtt != null && <PingMeter rtt={rtt} />}
        {onlineCount > 0 && (
          <Badge variant="status" tone="success" uppercase>
            {t('presence.onlineN', { count: onlineCount })}
          </Badge>
        )}
      </div>
      <LanguageSwitcher />
      <ThemeToggle />
      <UserChipAvatar />
    </header>
  );
}

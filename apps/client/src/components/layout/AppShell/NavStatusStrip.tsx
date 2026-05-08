import { useTranslation } from 'react-i18next';
import ThemeToggle from '../../Header/ThemeToggle';
import PingMeter from '../../ui/PingMeter';
import Badge from '../../ui/Badge';
import { useWebRTCStats } from '../../../hooks/useWebRTCStats';
import { useOnlineUsers } from '../../../hooks/useOnlineUsers';
import styles from './NavStatusStrip.module.css';

export default function NavStatusStrip() {
  const { rtt } = useWebRTCStats();
  const { count: onlineCount } = useOnlineUsers();
  const { t } = useTranslation('common');

  return (
    <div className={styles.strip}>
      {(rtt != null || onlineCount > 0) && (
        <div className={styles.row}>
          {rtt != null && <PingMeter rtt={rtt} />}
          {onlineCount > 0 && (
            <Badge variant="status" tone="success" uppercase>
              {t('presence.onlineN', { count: onlineCount })}
            </Badge>
          )}
        </div>
      )}
      <ThemeToggle />
    </div>
  );
}

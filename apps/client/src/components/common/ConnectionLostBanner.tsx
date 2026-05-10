import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../store';
import { useWssConnected } from '../../api/useWssConnected';
import styles from './ConnectionLostBanner.module.css';

export default function ConnectionLostBanner(): JSX.Element | null {
  const { t } = useTranslation('gameroom');
  const connected = useWssConnected();
  const reconnecting = useAppSelector((s) => s.notifications.socketReconnecting);
  if (connected && !reconnecting) return null;
  return (
    <div className={styles.banner} role="alert" aria-live="assertive" aria-atomic="true">
      <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
      <span>{t('connection.reconnecting')}</span>
    </div>
  );
}

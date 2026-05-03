import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import styles from './CreateRoomCard.module.css';

export interface CreateRoomCardProps {
  onClick: () => void;
  disabled?: boolean;
}

export default function CreateRoomCard({ onClick, disabled = false }: CreateRoomCardProps) {
  const { t } = useTranslation(['room', 'errors']);

  return (
    <Card
      dashed
      interactive={!disabled}
      onClick={disabled ? undefined : onClick}
      className={[styles.card, disabled ? styles.cardDisabled : ''].filter(Boolean).join(' ')}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      title={disabled ? t('errors:rooms.limitReachedShort') : undefined}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Plus size={32} className={styles.plus} aria-hidden="true" />
      <span className={styles.title}>{t('room:dashboard.createCard.heading')}</span>
      <span className={styles.subtitle}>{t('room:dashboard.createCard.subheading')}</span>
    </Card>
  );
}

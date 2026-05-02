import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import styles from './CreateRoomCard.module.css';

export interface CreateRoomCardProps {
  onClick: () => void;
}

export default function CreateRoomCard({ onClick }: CreateRoomCardProps) {
  const { t } = useTranslation('room');

  return (
    <Card dashed interactive onClick={onClick} className={styles.card} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}>
      <Plus size={32} className={styles.plus} aria-hidden="true" />
      <span className={styles.title}>{t('dashboard.createCard.heading')}</span>
      <span className={styles.subtitle}>{t('dashboard.createCard.subheading')}</span>
    </Card>
  );
}

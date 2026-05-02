import { useTranslation } from 'react-i18next';
import type { RoomDTO } from '@vtt/shared';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { gameSystemAccent } from './gameSystem';
import styles from './RoomCard.module.css';

export interface RoomCardProps {
  room: RoomDTO;
  /** The role of the current user inside this room (mapped at parent). */
  myRole: 'GM' | 'Player' | 'Observer' | null;
  onOpen: (room: RoomDTO) => void;
}

const MAX_AVATARS = 4;

export default function RoomCard({ room, myRole, onOpen }: RoomCardProps) {
  const { t } = useTranslation(['room', 'common']);
  const accent = gameSystemAccent(room.gameSystem);
  const visibleMembers = room.members.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, room.members.length - MAX_AVATARS);

  const eyebrowTone = room.status === 'active' ? styles.eyebrowActive : styles.eyebrowMuted;

  return (
    <Card accent={accent} className={styles.card} data-testid="room-card">
      <div className={styles.header}>
        <span className={`eyebrow ${eyebrowTone}`}>
          {room.gameSystem} · {t(`room:status.${room.status}`)}
        </span>
      </div>

      <h3 className={styles.name} title={room.name}>{room.name}</h3>

      <div className={styles.meta}>
        {myRole && (
          <span className={styles.metaRow}>
            {t('room:dashboard.card.role', { role: t(`room:roles.${myRole}`) })}
          </span>
        )}
        <span className={styles.metaRow}>
          {t('room:dashboard.membersCount', { count: room.members.length })}
        </span>
      </div>

      <div className={styles.footer}>
        <div className={styles.avatarStack} aria-hidden="true">
          {visibleMembers.map((m) => (
            <Avatar key={m.userId} name={m.name} size="sm" className={styles.avatar} />
          ))}
          {overflow > 0 && <span className={styles.overflow}>+{overflow}</span>}
        </div>
        <Button size="sm" variant="primary" onClick={() => onOpen(room)}>
          {t('common:btn.open')}
        </Button>
      </div>
    </Card>
  );
}

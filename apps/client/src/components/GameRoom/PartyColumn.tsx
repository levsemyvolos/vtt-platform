import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { Avatar, Badge } from '../ui';
import VideoCall from '../VideoCall/VideoCall';
import styles from './PartyColumn.module.css';

interface PartyColumnProps {
  roomId: string;
  myUserId: string;
}

const ROLE_LABEL: Record<Role, string> = {
  GM: 'GM',
  Player: 'Player',
  Observer: 'Observer',
};

function roleBadgeVariant(role: Role): 'role' | 'neutral' {
  return role === 'GM' ? 'role' : 'neutral';
}

export default function PartyColumn({ roomId, myUserId }: PartyColumnProps): JSX.Element {
  const { t } = useTranslation('gameroom');
  const members = useAppSelector((s) => s.room.members);

  return (
    <aside className={styles.column} aria-label={t('party.eyebrow')}>
      <p className={styles.eyebrow}>
        {t('party.eyebrow')} &middot; {members.length}
      </p>

      <div className={styles.videoWrap}>
      <VideoCall roomId={roomId} myUserId={myUserId} members={members} />
      </div>

      <ul className={styles.memberList} role="list">
        {members.map((m) => (
          <li key={m.userId} className={styles.memberCard}>
            <Avatar
              name={m.name}
              size="md"
              {...(m.userId === myUserId ? { status: 'online' as const } : {})}
            />
            <div className={styles.memberInfo}>
              <span className={styles.memberName}>{m.name}</span>
              <Badge variant={roleBadgeVariant(m.role)}>
                {ROLE_LABEL[m.role]}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

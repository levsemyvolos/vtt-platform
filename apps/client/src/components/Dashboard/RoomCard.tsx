import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical } from 'lucide-react';
import type { RoomDTO } from '@vtt/shared';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { gameSystemAccent } from './gameSystem';
import EditRoomModal from './EditRoomModal';
import DeleteRoomModal from './DeleteRoomModal';
import { formatRelativeTime } from '../../utils/relativeTime';
import styles from './RoomCard.module.css';

export interface RoomCardProps {
  room: RoomDTO;
  /** The role of the current user inside this room (mapped at parent). */
  myRole: 'GM' | 'Player' | 'Observer' | null;
  currentUserId: string | null;
  onOpen: (room: RoomDTO) => void;
}

const MAX_AVATARS = 4;

export default function RoomCard({ room, myRole, currentUserId, onOpen }: RoomCardProps) {
  const { t, i18n } = useTranslation(['room', 'common']);
  const accent = gameSystemAccent(room.gameSystem);
  const visibleMembers = room.members.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, room.members.length - MAX_AVATARS);
  const isOwner = room.ownerId === currentUserId;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const eyebrowTone = room.status === 'active' ? styles.eyebrowActive : styles.eyebrowMuted;

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setDeleteOpen(true);
  };

  const relTime = formatRelativeTime(room.lastActiveAt, i18n.language);

  return (
    <>
      <Card accent={accent} className={styles.card} data-testid="room-card">
        <div className={styles.header}>
          <span className={`eyebrow ${eyebrowTone}`}>
            {room.gameSystem} · {t(`room:status.${room.status}`)}
          </span>
          {isOwner && (
            <div className={styles.menuWrap} ref={menuRef}>
              <button
                type="button"
                className={styles.menuBtn}
                onClick={handleMenuToggle}
                aria-label={t('common:btn.more')}
                aria-haspopup="true"
                aria-expanded={menuOpen}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className={styles.dropdown} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.dropdownItem}
                    onClick={handleEdit}
                  >
                    {t('room:edit.menuItem')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                    onClick={handleDelete}
                  >
                    {t('room:delete.menuItem')}
                  </button>
                </div>
              )}
            </div>
          )}
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
          <span className={styles.metaRow}>
            {t('room:lastActive.label', { time: relTime })}
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

      {editOpen && <EditRoomModal room={room} onClose={() => setEditOpen(false)} />}
      {deleteOpen && <DeleteRoomModal room={room} onClose={() => setDeleteOpen(false)} />}
    </>
  );
}

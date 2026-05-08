import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical } from 'lucide-react';
import type { RoomDTO } from '@vtt/shared';
import Card from '../ui/Card';
import Avatar from '../ui/Avatar';
import { gameSystemAccent, accentVar } from './gameSystem';
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

export default function RoomCard({ room, currentUserId, onOpen }: RoomCardProps) {
  const { t, i18n } = useTranslation(['room', 'common']);
  const accentEnum = gameSystemAccent(room.gameSystem);
  const accent = accentVar(accentEnum);
  const visibleMembers = room.members.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, room.members.length - MAX_AVATARS);
  const isOwner = room.ownerId === currentUserId;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // B6-BUG-001: close dropdown on click-outside + Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const statusClass = room.status === 'active' ? styles.statusActive : styles.statusDormant;

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

  const handleCardClick = () => {
    onOpen(room);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(room);
    }
  };

  const relTime = formatRelativeTime(room.lastActiveAt, i18n.language);

  return (
    <>
      <Card
        className={`glass glass-strong ${styles.card}`}
        data-testid="room-card"
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={room.name}
      >
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <div className={styles.accentBar} style={{ background: accent }} />
            <div className={styles.system}>
              {room.gameSystem.toUpperCase()} ·{' '}
              <span className={statusClass}>{t(`room:status.${room.status}`)}</span>
            </div>
          </div>
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

        <p className={styles.desc}>
          {room.description?.trim() || t('room:dashboard.card.descFallback')}
        </p>

        <div className={styles.footer}>
          <div className={styles.avatarStack} aria-hidden="true">
            {visibleMembers.map((m) => (
              <Avatar key={m.userId} name={m.name} size="sm" className={styles.avatar} />
            ))}
            {overflow > 0 && <span className={styles.overflow}>+{overflow}</span>}
          </div>
          <span className={styles.created}>{relTime}</span>
        </div>
      </Card>

      {editOpen && <EditRoomModal room={room} onClose={() => setEditOpen(false)} />}
      {deleteOpen && <DeleteRoomModal room={room} onClose={() => setDeleteOpen(false)} />}
    </>
  );
}

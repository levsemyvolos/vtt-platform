import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { Role, RoomMemberDTO } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { Avatar, Badge, IconButton } from '../ui';
import VideoCall from '../VideoCall/VideoCall';
import MediaControls from './MediaControls';
import ParticipantMenu, { type MenuTarget } from './ParticipantMenu';
import { useDragReorder } from '../../hooks/useDragReorder';
import styles from './PartyColumn.module.css';

interface PartyColumnProps {
  roomId: string;
  myUserId: string;
  myRole: Role;
}

const ROLE_LABEL: Record<Role, string> = {
  GM: 'GM',
  Player: 'Player',
  Observer: 'Observer',
};

function roleBadgeVariant(role: Role): 'role' | 'neutral' {
  return role === 'GM' ? 'role' : 'neutral';
}

const LS_KEY = 'vtt.participantsOpen';

export default function PartyColumn({ roomId, myUserId, myRole }: PartyColumnProps): JSX.Element {
  const { t } = useTranslation('gameroom');
  const members = useAppSelector((s) => s.room.members);

  const [participantsOpen, setParticipantsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved === null ? true : saved === '1';
  });

  const [menu, setMenu] = useState<{ rect: DOMRect; target: MenuTarget } | null>(null);
  const [memberOrder, setMemberOrder] = useState<RoomMemberDTO[]>(members);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync order when server pushes new members (join/leave).
  useEffect(() => {
    setMemberOrder((prev) => {
      const prevIds = prev.map((m) => m.userId);
      const newIds = members.map((m) => m.userId);
      // Keep existing order; append new; remove departed.
      const kept = prev.filter((m) => newIds.includes(m.userId)).map((m) => {
        // Refresh data (role may have changed via demote).
        const fresh = members.find((x) => x.userId === m.userId);
        return fresh ?? m;
      });
      const added = members.filter((m) => !prevIds.includes(m.userId));
      return [...kept, ...added];
    });
  }, [members]);

  const { getItemProps: getMemberDragProps, isDragOver: isMemberDragOver } = useDragReorder(
    memberOrder,
    (m) => m.userId,
    setMemberOrder,
  );

  useEffect(() => {
    localStorage.setItem(LS_KEY, participantsOpen ? '1' : '0');
  }, [participantsOpen]);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, member: RoomMemberDTO): void {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      rect,
      target: { ...member, isSelf: member.userId === myUserId },
    });
  }

  function closeMenu(): void {
    setMenu(null);
  }

  return (
    <aside ref={wrapRef} className={styles.column} aria-label={t('party.eyebrow')}>
      <p className={styles.eyebrow}>
        {t('party.eyebrow')} &middot; {members.length}
      </p>

      {myRole !== 'Observer' && (
        <>
          <div className={styles.videoWrap}>
            <VideoCall roomId={roomId} myUserId={myUserId} members={members} />
          </div>

          <MediaControls />
        </>
      )}

      <button
        type="button"
        className={styles.toggleRow}
        onClick={() => setParticipantsOpen((v) => !v)}
        aria-expanded={participantsOpen}
      >
        <span>{t('party.participantsCount', { count: members.length })}</span>
        <span className={styles.toggleChev} aria-hidden>
          {participantsOpen ? (
            <>
              <ChevronDown size={12} />
              {t('party.participantsHide')}
            </>
          ) : (
            <>
              <ChevronRight size={12} />
              {t('party.participantsShow')}
            </>
          )}
        </span>
      </button>

      {participantsOpen && (
        <ul className={styles.memberList} role="list">
          {memberOrder.map((m, idx) => {
            const isSelf = m.userId === myUserId;
            return (
              <li
                key={m.userId}
                className={`${styles.memberCard} ${isMemberDragOver(idx) ? styles.memberDragOver : ''}`}
                {...getMemberDragProps(idx)}
              >
                <Avatar
                  name={m.name}
                  size="md"
                  {...(isSelf ? { status: 'online' as const } : {})}
                />
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{m.name}</span>
                  <Badge variant={roleBadgeVariant(m.role)}>
                    {ROLE_LABEL[m.role]}
                  </Badge>
                </div>
                {!isSelf && (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={(e) => openMenu(e, m)}
                    aria-label={t('participantMenu.openMenu')}
                    title={t('participantMenu.openMenu')}
                    className={styles.moreBtn}
                  >
                    <MoreHorizontal size={14} />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {menu && (
        <ParticipantMenu
          triggerRect={menu.rect}
          target={menu.target}
          viewerRole={myRole}
          roomId={roomId}
          onClose={closeMenu}
        />
      )}
    </aside>
  );
}

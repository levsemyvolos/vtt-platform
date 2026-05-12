import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { Role, RoomMemberDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { addToast } from '../../store/toast';
import { togglePinPeer } from '../../store/media';
import { emitModKick, emitModDemote, emitModServerMute, emitModForceCamOff } from '../../api/socket';
import styles from './ParticipantMenu.module.css';

export interface MenuTarget extends RoomMemberDTO {
  isSelf: boolean;
}

interface Props {
  triggerRect: DOMRect;
  target: MenuTarget;
  viewerRole: Role;
  roomId: string;
  onClose: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  onClick: () => void;
  mock?: boolean;
  danger?: boolean;
}

interface Pos {
  left: number;
  top: number;
}

const MARGIN = 8;

export default function ParticipantMenu({ triggerRect, target, viewerRole, roomId, onClose }: Props): JSX.Element {
  const { t } = useTranslation('gameroom');
  const dispatch = useAppDispatch();
  const pinnedPeerIds = useAppSelector((s) => s.media.pinnedPeerIds);
  const isPinned = pinnedPeerIds.includes(target.userId);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    function onMouseDown(e: MouseEvent): void {
      const tgt = e.target as Element;
      if (!tgt.closest(`.${styles.menu}`)) onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onMouseDown);
    };
  }, [onClose]);

  // Smart positioning: flip horizontally / vertically to stay inside viewport.
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: prefer right of trigger, flip to left if overflow.
    let left = triggerRect.right + 4;
    if (left + menuRect.width + MARGIN > vw) {
      left = triggerRect.left - menuRect.width - 4;
    }
    // Final clamp — never go negative.
    if (left < MARGIN) left = MARGIN;

    // Vertical: prefer below trigger, flip above if overflow.
    let top = triggerRect.bottom + 4;
    if (top + menuRect.height + MARGIN > vh) {
      top = triggerRect.top - menuRect.height - 4;
    }
    if (top < MARGIN) top = MARGIN;

    setPos({ left, top });
  }, [triggerRect]);

  function mockToast(label: string): void {
    dispatch(addToast('info', `${label} — ${t('participantMenu.comingNextEpoch')}`));
  }

  const items: MenuItem[] = [];

  // Self menu is no longer used (caller filters), but keep a minimal fallback
  // in case isSelf is true: just show identity head, no actions.
  if (!target.isSelf) {
    items.push({
      key: 'pin',
      label: isPinned ? t('participantMenu.unpinForMe') : t('participantMenu.pinForMe'),
      onClick: () => dispatch(togglePinPeer(target.userId)),
    });
    items.push({
      key: 'mute-local',
      label: t('participantMenu.muteLocally'),
      onClick: () => mockToast(t('participantMenu.muteLocally')),
      mock: true,
    });

    if (viewerRole === 'GM') {
      items.push({
        key: 'server-mute',
        label: t('participantMenu.serverMute'),
        onClick: () => emitModServerMute({ roomId, targetUserId: target.userId }),
      });
      items.push({
        key: 'force-cam',
        label: t('participantMenu.forceCamOff'),
        onClick: () => emitModForceCamOff({ roomId, targetUserId: target.userId }),
      });
      items.push({
        key: 'demote',
        label: t('participantMenu.demote'),
        onClick: () => {
          void emitModDemote({ roomId, targetUserId: target.userId }).catch((err: unknown) => {
            dispatch(addToast('error', err instanceof Error ? err.message : t('participantMenu.errorFallback')));
          });
        },
      });
      items.push({
        key: 'kick',
        label: t('participantMenu.kick'),
        onClick: () => {
          void emitModKick({ roomId, targetUserId: target.userId }).catch((err: unknown) => {
            dispatch(addToast('error', err instanceof Error ? err.message : t('participantMenu.errorFallback')));
          });
        },
        danger: true,
      });
    }
  }

  // Render off-screen on first paint to measure, then jump to final position.
  const initialStyle = pos
    ? { left: pos.left, top: pos.top, visibility: 'visible' as const }
    : { left: -9999, top: -9999, visibility: 'hidden' as const };

  return createPortal(
    <div ref={menuRef} className={styles.menu} style={initialStyle} role="menu">
      <div className={styles.head}>{target.name}</div>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`${styles.item}${it.mock ? ` ${styles.mock}` : ''}${it.danger ? ` ${styles.danger}` : ''}`}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          data-mock={it.mock ? 'true' : undefined}
          role="menuitem"
        >
          {it.label}
          {it.mock && <span className={styles.mockBadge}>soon</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

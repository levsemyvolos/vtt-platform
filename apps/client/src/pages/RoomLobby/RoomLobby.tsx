import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { leaveRoom, startSession } from '../../store/room';
import { logout, selectIsObserver } from '../../store/session';
import { apiFetch } from '../../api/apiFetch';
import { connectSocket, emitRoomJoin } from '../../api/socket';
import SceneManager from '../../components/SceneManager/SceneManager';
import InviteLink from '../../components/InviteLink/InviteLink';
import { ConnectionStepper } from '../../components/Lobby';
import styles from './RoomLobby.module.css';

export default function RoomLobby(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation('room');
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const isObserver = useAppSelector(selectIsObserver);

  const roomId = currentRoom?.id;

  // Connect socket and join the room channel so we receive room:started from server.
  useEffect(() => {
    if (!roomId) return;
    connectSocket();
    void emitRoomJoin(roomId);
  }, [roomId]);

  if (!currentRoom) return null;

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isGM = myMember?.role === 'GM';
  const myRole: Role = myMember?.role ?? 'Observer';

  const handleLeave = (): void => {
    if (isObserver) {
      void dispatch(logout());
    } else {
      dispatch(leaveRoom());
      navigate('/dashboard', { replace: true });
    }
  };

  const handleEnterSession = (): void => {
    if (isGM) {
      // GM: call API to set room status=active — server broadcasts room:started
      // to all room members (including GM) via WS. All lobby clients auto-transition.
      void apiFetch(`/api/rooms/${currentRoom.id}/start`, { method: 'POST' });
    } else {
      // Player/Observer: join voluntarily when session is already active.
      dispatch(startSession());
    }
  };

  function roleBadgeClass(role: string): string {
    if (role === 'GM') return styles.roleGm as string;
    if (role === 'Player') return styles.rolePlayer as string;
    return styles.roleObserver as string;
  }

  return (
    <div className={styles.lobbyPage}>
      <div className={styles.lobby}>
        <ConnectionStepper />

        <header className={styles.lobbyHeader}>
          <button type="button" className={styles.btnBack} onClick={handleLeave}>
            {t('lobby.backBtn')}
          </button>
          <div className={styles.headerTitle}>
            <h1>{currentRoom.name}</h1>
            <span className={styles.roomSystem}>{currentRoom.gameSystem}</span>
          </div>
          <div className={styles.headerRight}>
            <span
              className={[
                styles.lobbyStatus,
                currentRoom.status === 'active' ? styles.statusActive : styles.statusIdle,
              ].join(' ')}
            >
              {t(`status.${currentRoom.status}`)}
            </span>
          </div>
        </header>

        {isGM && <InviteLink roomId={currentRoom.id} />}

        <SceneManager roomId={currentRoom.id} myRole={myRole} />

        <section className={styles.membersSection}>
          <h2 className={styles.membersEyebrow}>
            {t('lobby.membersHeading', { count: members.length })}
          </h2>
          <ul className={styles.memberList}>
            {members.map((member) => (
              <li key={member.userId} className={styles.memberCard}>
                <span className={[styles.roleBadge, roleBadgeClass(member.role)].join(' ')}>
                  {t(`roles.${member.role}`)}
                </span>
                <span className={styles.memberName}>{member.name}</span>
                {member.characterId && (
                  <span className={styles.characterBadge} title={t('lobby.characterAttached')}>
                    &#9823;
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {(isGM || currentRoom.status === 'active') && (
          <div className={styles.gmControls}>
            <button type="button" className={styles.btnStart} onClick={handleEnterSession}>
              {isGM ? t('lobby.startSession') : t('lobby.joinSession')}
            </button>
          </div>
        )}

        {myMember && (
          <footer className={styles.lobbyFooter}>
            {t('lobby.yourRole')} <strong>{t(`roles.${myMember.role}`)}</strong>
          </footer>
        )}
      </div>
    </div>
  );
}

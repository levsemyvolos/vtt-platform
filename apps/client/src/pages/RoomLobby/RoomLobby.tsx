import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom, startSession } from '../../store/room';
import { logout, selectIsObserver } from '../../store/session';
import SceneManager from '../../components/SceneManager/SceneManager';
import InviteLink from '../../components/InviteLink/InviteLink';
import { ConnectionStepper } from '../../components/Lobby';
import styles from './RoomLobby.module.css';

export default function RoomLobby(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const isObserver = useAppSelector(selectIsObserver);

  if (!currentRoom) return null;

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isGM = myMember?.role === 'GM';
  const myRole: Role = myMember?.role ?? 'Observer';

  const handleLeave = (): void => {
    // Observers have no Dashboard to return to — logout instead of clearRoom.
    if (isObserver) {
      void dispatch(logout());
    } else {
      dispatch(clearRoom());
    }
  };

  const handleEnterSession = (): void => {
    dispatch(startSession());
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
            <InviteLink roomId={currentRoom.id} />
          </div>
        </header>

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

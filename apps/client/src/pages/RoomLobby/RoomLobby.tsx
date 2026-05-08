import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowLeft, Crown, Eye, Sword, UserRound } from 'lucide-react';
import type { Role } from '@vtt/shared';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { leaveRoom, startSession } from '../../store/room';
import { logout, selectIsObserver } from '../../store/session';
import { apiFetch } from '../../api/apiFetch';
import { connectSocket, emitRoomJoin } from '../../api/socket';
import SceneManager from '../../components/SceneManager/SceneManager';
import InviteLink from '../../components/InviteLink/InviteLink';
import { Button, StatusBadge } from '../../components/ui';
import styles from './RoomLobby.module.css';

function RoleIcon({ role }: { role: Role }): JSX.Element {
  if (role === 'GM') return <Crown size={16} strokeWidth={1.5} className="icon-accent icon-primary" />;
  if (role === 'Player') return <Sword size={16} strokeWidth={1.5} className="icon-accent" />;
  return <Eye size={16} strokeWidth={1.5} className="icon-accent" />;
}

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
  const showSession = isGM || (currentRoom.status === 'active' && !isObserver);
  const showStatusBadge = currentRoom.status !== 'lobby';

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

  return (
    <div className={styles.lobbyPage}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<ArrowLeft size={14} strokeWidth={2} />}
            onClick={handleLeave}
          >
            {t('lobby.backToDashboard')}
          </Button>
          {showStatusBadge && (
            <StatusBadge tone={currentRoom.status === 'active' ? 'live' : 'danger'}>
              {t(`status.${currentRoom.status}`)}
            </StatusBadge>
          )}
        </div>
        <div className={styles.heroBody}>
          <div className={styles.heroLeft}>
            <div className="eyebrow accent">
              {t('lobby.eyebrow', { system: currentRoom.gameSystem })}
            </div>
            <h1 className={styles.title}>
              <Trans
                i18nKey="lobby.heading"
                ns="room"
                values={{ name: currentRoom.name }}
                components={{ em: <em /> }}
              />
            </h1>
            <p className={styles.lede}>{t('lobby.systemLabel')}</p>
          </div>

          {showSession && (
            <div className={styles.heroAction}>
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleEnterSession}
              >
                {isGM ? t('lobby.startSession') : t('lobby.joinSession')}
              </Button>
            </div>
          )}
        </div>
        <hr className="fold" />
      </header>

      <div className={styles.contentGrid}>
        <div className={styles.leftStack}>
          <section className={`glass glass-strong ${styles.membersSection}`}>
            <div className={styles.sectionHead}>
              <div>
                <div className={styles.sectionEyebrow}>{t('lobby.membersEyebrow')}</div>
                <h2 className={styles.sectionTitle}>
                  <Trans
                    i18nKey="lobby.membersTitle"
                    ns="room"
                    values={{ count: members.length }}
                    components={{ em: <em /> }}
                  />
                </h2>
              </div>
            </div>
            <ul className={styles.memberList}>
              {members.map((member) => (
                <li key={member.userId} className={styles.memberCard}>
                  <span className={styles.roleIcon} aria-hidden="true">
                    <RoleIcon role={member.role} />
                  </span>
                  <span className={styles.memberBody}>
                    <span className={styles.memberName}>{member.name}</span>
                    <span className={styles.memberMeta}>
                      {t(`roles.${member.role}`)}
                      {member.characterId ? ` · ${t('lobby.characterAttached')}` : ''}
                    </span>
                  </span>
                  <UserRound size={16} strokeWidth={1.5} className="icon-accent" aria-hidden="true" />
                </li>
              ))}
            </ul>
          </section>

          {isGM && <InviteLink roomId={currentRoom.id} />}
        </div>

        <div className={styles.rightStack}>
          <SceneManager roomId={currentRoom.id} myRole={myRole} />
        </div>
      </div>

    </div>
  );
}

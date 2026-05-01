import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';
import { hydrateScene } from '../../store/scene';
import { hydrateChat } from '../../store/chat';
import { hydrateInitiative } from '../../store/initiative';
import { connectSocket, emitRoomJoin, emitSessionResync } from '../../api/socket';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import Sidebar from '../../components/Sidebar/Sidebar';
import ChatPanel from '../../components/ChatPanel/ChatPanel';
import DiceRoller from '../../components/DiceRoller/DiceRoller';
import SceneManager from '../../components/SceneManager/SceneManager';
import InviteLink from '../../components/InviteLink/InviteLink';
import styles from './RoomLobby.module.css';

export default function RoomLobby(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const [sessionStarted, setSessionStarted] = useState(false);

  useEffect(() => {
    if (currentRoom?.status === 'active') setSessionStarted(true);
  }, [currentRoom?.status]);

  if (!currentRoom) return null;

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isGM = myMember?.role === 'GM';
  const myRole: Role = myMember?.role ?? 'Observer';

  const handleLeave = (): void => {
    dispatch(clearRoom());
    setSessionStarted(false);
  };

  if (sessionStarted) {
    return (
      <SessionView
        room={currentRoom}
        myRole={myRole}
        myCharacterId={myMember?.characterId ?? null}
        onLeave={handleLeave}
      />
    );
  }

  function roleBadgeClass(role: string): string {
    if (role === 'GM') return styles.roleGm as string;
    if (role === 'Player') return styles.rolePlayer as string;
    return styles.roleObserver as string;
  }

  return (
    <div className={styles.lobby}>
      <header className={styles.lobbyHeader}>
        <button type="button" className={styles.btnBack} onClick={handleLeave}>
          {t('lobby.backBtn')}
        </button>
        <div>
          <h1>{currentRoom.name}</h1>
          <span className={styles.roomSystem}>{currentRoom.gameSystem}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.lobbyStatus} ${currentRoom.status === 'active' ? styles.statusActive : styles.statusIdle}`}>
            {t(`status.${currentRoom.status}`)}
          </span>
          <InviteLink roomId={currentRoom.id} />
        </div>
      </header>

      <SceneManager roomId={currentRoom.id} myRole={myRole} />

      <section className={styles.membersSection}>
        <h2>{t('lobby.membersHeading', { count: members.length })}</h2>
        <ul className={styles.memberList}>
          {members.map((member) => (
            <li key={member.userId} className={styles.memberCard}>
              <span className={`${styles.roleBadge} ${roleBadgeClass(member.role)}`}>
                {t(`roles.${member.role}`)}
              </span>
              <span className={styles.memberName}>{member.name}</span>
              {member.characterId && (
                <span className={styles.characterBadge} title={t('lobby.characterAttached')}>
                  ♟
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(isGM || currentRoom.status === 'active') && (
        <div className={styles.gmControls}>
          <button type="button" className={styles.btnStart} onClick={() => setSessionStarted(true)}>
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
  );
}

interface SessionViewProps {
  room: RoomDTO;
  myRole: Role;
  myCharacterId: string | null;
  onLeave: () => void;
}

function SessionView({ room, myRole, myCharacterId, onLeave }: SessionViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const scene = useAppSelector((s) => s.scene.current);
  const { currentUser } = useAppSelector((s) => s.session);
  const { t } = useTranslation(['room', 'errors']);
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    setHydrateError(null);
    connectSocket();
    (async () => {
      try {
        await emitRoomJoin(room.id);
        const payload = await emitSessionResync(room.id);
        if (!cancelled) {
          dispatch(hydrateScene(payload.scene));
          dispatch(hydrateChat(payload.messages));
          dispatch(hydrateInitiative(payload.initiatives));
        }
      } catch (err) {
        if (!cancelled) {
          const raw = err instanceof Error ? err.message : '';
          // 404 "Room has no active scene" — це нормальний empty-state, не помилка
          if (raw.includes('no active scene')) {
            setHydrateError(null);
          } else {
            setHydrateError(raw.startsWith('errors:') ? t(raw as never) : t('errors:network.joinFailed'));
          }
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [room.id, t, dispatch]);

  return (
    <div className={styles.gameRoom}>
      <header className={styles.gameRoomHeader}>
        <button type="button" className={styles.btnBack} onClick={onLeave}>
          {t('room:lobby.exitBtn')}
        </button>
        <h1>{room.name}</h1>
        <span className={styles.gameRoomRole}>
          {t('room:lobby.roleLabel')} {t(`room:roles.${myRole}`)}
        </span>
      </header>
      <div className={styles.gameRoomLayout}>
        <main className={styles.gameRoomCanvas}>
          {scene ? (
            <GameCanvas scene={scene} myRole={myRole} myUserId={currentUser?.id ?? ''} />
          ) : (
            <div className={styles.canvasPlaceholder}>
              {hydrating
                ? t('room:lobby.sessionLoading')
                : hydrateError
                  ? t('room:lobby.sessionError', { message: hydrateError })
                  : t('room:lobby.noActiveScene')}
            </div>
          )}
        </main>
        <section className={styles.gameRoomSide}>
          <Sidebar
            roomId={room.id}
            sceneId={scene?.id ?? null}
            myRole={myRole}
            myCharacterId={myCharacterId}
            myUserId={currentUser?.id ?? ''}
          />
          <DiceRoller roomId={room.id} />
          <ChatPanel roomId={room.id} />
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';
import { connectSocket, emitRoomJoin, emitSessionResync } from '../../api/socket';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import Sidebar from '../../components/Sidebar/Sidebar';
import ChatPanel from '../../components/ChatPanel/ChatPanel';
import DiceRoller from '../../components/DiceRoller/DiceRoller';
import SceneManager from '../../components/SceneManager/SceneManager';
import InviteLink from '../../components/InviteLink/InviteLink';

export default function RoomLobby(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Auto-enter the session view when the room is already active server-side.
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

  const handleStartSession = (): void => setSessionStarted(true);

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

  return (
    <div className="room-lobby">
      <header className="lobby-header">
        <button type="button" className="btn-back" onClick={handleLeave}>
          {t('lobby.backBtn')}
        </button>
        <div>
          <h1>{currentRoom.name}</h1>
          <span className="room-system">{currentRoom.gameSystem}</span>
        </div>
        <div className="lobby-header__right">
          <span className={`lobby-status status--${currentRoom.status}`}>
            {t(`status.${currentRoom.status}`)}
          </span>
          <InviteLink roomId={currentRoom.id} />
        </div>
      </header>

      <SceneManager roomId={currentRoom.id} myRole={myRole} />

      <section className="members-section">
        <h2>{t('lobby.membersHeading', { count: members.length })}</h2>
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.userId} className="member-card">
              <span className={`role-badge role--${member.role.toLowerCase()}`}>
                {t(`roles.${member.role}`)}
              </span>
              <span className="member-name">{member.name}</span>
              {member.characterId && (
                <span className="character-badge" title={t('lobby.characterAttached')}>
                  ♟
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(isGM || currentRoom.status === 'active') && (
        <div className="gm-controls">
          <button type="button" className="btn-start" onClick={handleStartSession}>
            {isGM ? t('lobby.startSession') : t('lobby.joinSession')}
          </button>
        </div>
      )}

      {myMember && (
        <footer className="lobby-footer">
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
  const scene = useAppSelector((s) => s.scene.current);
  const { currentUser } = useAppSelector((s) => s.session);
  const { t } = useTranslation(['room', 'errors']);
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  // Connect socket → join room → request A3 resync. Runs once when the session view mounts.
  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    setHydrateError(null);
    connectSocket();
    (async () => {
      try {
        await emitRoomJoin(room.id);
        await emitSessionResync(room.id);
      } catch (err) {
        if (!cancelled) {
          setHydrateError(err instanceof Error ? err.message : t('errors:network.joinFailed'));
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id, t]);

  return (
    <div className="game-room">
      <header className="game-room__header">
        <button type="button" className="btn-back" onClick={onLeave}>
          {t('room:lobby.exitBtn')}
        </button>
        <h1>{room.name}</h1>
        <span className="game-room__role">
          {t('room:lobby.roleLabel')} {t(`room:roles.${myRole}`)}
        </span>
      </header>
      <div className="game-room__layout">
        <main className="game-room__canvas">
          {scene ? (
            <GameCanvas scene={scene} myRole={myRole} myUserId={currentUser?.id ?? ''} />
          ) : (
            <div className="game-room__canvas-placeholder">
              {hydrating
                ? t('room:lobby.sessionLoading')
                : hydrateError
                  ? t('room:lobby.sessionError', { message: hydrateError })
                  : t('room:lobby.noActiveScene')}
            </div>
          )}
        </main>
        <section className="game-room__side">
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

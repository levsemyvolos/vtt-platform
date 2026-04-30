import { useEffect, useState } from 'react';
import type { RoomDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';
import { connectSocket, emitRoomJoin, emitSessionResync } from '../../api/socket';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import Sidebar from '../../components/Sidebar/Sidebar';
import ChatPanel from '../../components/ChatPanel/ChatPanel';
import DiceRoller from '../../components/DiceRoller/DiceRoller';

const ROLE_LABEL = {
  GM: 'Ведучий',
  Player: 'Гравець',
  Observer: 'Спостерігач',
} as const;

export default function RoomLobby(): JSX.Element | null {
  const dispatch = useAppDispatch();
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

  // Local toggle: a proper room-status transition (lobby → active) is server
  // work and does not yet have a REST endpoint — tracked for a follow-up
  // server-side chat. For Etap 1 MVP the GM flips the view client-side.
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
          ← Назад
        </button>
        <div>
          <h1>{currentRoom.name}</h1>
          <span className="room-system">{currentRoom.gameSystem}</span>
        </div>
        <span className={`lobby-status status--${currentRoom.status}`}>
          {currentRoom.status}
        </span>
      </header>

      <section className="members-section">
        <h2>Учасники ({members.length})</h2>
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.userId} className="member-card">
              <span className={`role-badge role--${member.role.toLowerCase()}`}>
                {ROLE_LABEL[member.role]}
              </span>
              <span className="member-name">{member.name}</span>
              {member.characterId && (
                <span className="character-badge" title="Персонаж прикріплено">
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
            {isGM ? 'Розпочати сесію' : 'Приєднатися до сесії'}
          </button>
        </div>
      )}

      {myMember && (
        <footer className="lobby-footer">
          Ваша роль: <strong>{ROLE_LABEL[myMember.role]}</strong>
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
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  // Connect socket → join room → request A3 resync (single round-trip
  // hydrates scene + chat + initiatives). Runs once when the session view
  // mounts.
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
          setHydrateError(err instanceof Error ? err.message : 'Не вдалося приєднатися до сесії');
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id]);

  return (
    <div className="game-room">
      <header className="game-room__header">
        <button type="button" className="btn-back" onClick={onLeave}>
          ← Вийти
        </button>
        <h1>{room.name}</h1>
        <span className="game-room__role">Роль: {ROLE_LABEL[myRole]}</span>
      </header>
      <div className="game-room__layout">
        <main className="game-room__canvas">
          {scene ? (
            <GameCanvas scene={scene} myRole={myRole} />
          ) : (
            <div className="game-room__canvas-placeholder">
              {hydrating
                ? 'Завантаження сцени…'
                : hydrateError
                  ? `Помилка: ${hydrateError}`
                  : 'Активної сцени ще немає. Створіть сцену через REST POST /rooms/:id/scenes.'}
            </div>
          )}
        </main>
        <section className="game-room__side">
          <Sidebar
            roomId={room.id}
            sceneId={scene?.id ?? null}
            myRole={myRole}
            myCharacterId={myCharacterId}
          />
          <DiceRoller roomId={room.id} />
          <ChatPanel roomId={room.id} />
        </section>
      </div>
    </div>
  );
}

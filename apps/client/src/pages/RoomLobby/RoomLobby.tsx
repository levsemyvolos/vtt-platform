import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';
import { apiFetch } from '../../api/apiFetch';
import {
  connectSocket,
  disconnectSocket,
  emitRoomJoin,
  emitSessionResync,
  getSocket,
} from '../../api/socket';
import DiceRoller from '../../components/DiceRoller/DiceRoller';
import ChatPanel from '../../components/ChatPanel/ChatPanel';

const ROLE_LABEL = {
  GM: 'Ведучий',
  Player: 'Гравець',
  Observer: 'Спостерігач',
} as const;

interface InviteTokens {
  playerToken: string;
  observerToken: string;
}

export default function RoomLobby() {
  const dispatch = useAppDispatch();
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const [invites, setInvites] = useState<InviteTokens | null>(null);
  const [rtStatus, setRtStatus] = useState<'idle' | 'connecting' | 'joined' | 'error'>(
    'idle',
  );
  const [rtError, setRtError] = useState<string | null>(null);

  // Connect socket + room:join + initial session:resync on mount.
  useEffect(() => {
    if (!currentRoom) return;
    const roomId = currentRoom.id;
    setRtStatus('connecting');
    connectSocket();
    const s = getSocket();
    const onConnect = (): void => {
      emitRoomJoin(roomId)
        .then(() => emitSessionResync(roomId).catch(() => undefined))
        .then(() => setRtStatus('joined'))
        .catch((e) => {
          setRtStatus('error');
          setRtError(e instanceof Error ? e.message : 'Join failed');
        });
    };
    s.on('connect', onConnect);
    if (s.connected) onConnect();
    return () => {
      s.off('connect', onConnect);
      disconnectSocket();
    };
  }, [currentRoom]);

  if (!currentRoom) return null;

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isGM = currentRoom.ownerId === currentUser?.id;

  const handleLeave = () => {
    disconnectSocket();
    dispatch(clearRoom());
  };

  const handleShowInvites = async (): Promise<void> => {
    try {
      const tokens = await apiFetch<InviteTokens>(
        `/api/rooms/${currentRoom.id}/invites`,
        { method: 'POST' },
      );
      setInvites(tokens);
    } catch (err) {
      setRtError(err instanceof Error ? err.message : 'Не вдалося отримати invite');
    }
  };

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
        <span className={`rt-status rt--${rtStatus}`} style={{ marginLeft: 12 }}>
          RT: {rtStatus}
        </span>
      </header>

      {rtError && <p className="lobby-error">⚠ {rtError}</p>}

      <section className="members-section">
        <h2>Учасники ({members.length})</h2>
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.userId} className="member-card">
              <span className={`role-badge role--${member.role.toLowerCase()}`}>
                {ROLE_LABEL[member.role]}
              </span>
              <span className="member-name">{member.name}</span>
            </li>
          ))}
          {myMember === undefined && currentUser && (
            <li className="member-card">
              <span className="role-badge">
                {isGM ? ROLE_LABEL.GM : ROLE_LABEL.Player}
              </span>
              <span className="member-name">{currentUser.name} (ви)</span>
            </li>
          )}
        </ul>
      </section>

      {isGM && (
        <section className="gm-controls">
          <button type="button" onClick={handleShowInvites}>
            Показати invite-токени
          </button>
          {invites && (
            <div className="invites">
              <p>
                Player: <code>{invites.playerToken}</code>
              </p>
              <p>
                Observer: <code>{invites.observerToken}</code>
              </p>
            </div>
          )}
        </section>
      )}

      {/* Real-time smoke harness — поки нема GameCanvas (Чат 7) */}
      {rtStatus === 'joined' && (
        <section className="rt-smoke" style={{ display: 'flex', gap: 16 }}>
          <DiceRoller roomId={currentRoom.id} />
          <ChatPanel roomId={currentRoom.id} />
        </section>
      )}
    </div>
  );
}

import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';

const ROLE_LABEL = {
  GM: 'Ведучий',
  Player: 'Гравець',
  Observer: 'Спостерігач',
} as const;

export default function RoomLobby() {
  const dispatch = useAppDispatch();
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);

  if (!currentRoom) return null;

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isGM = myMember?.role === 'GM';

  const handleLeave = () => {
    dispatch(clearRoom());
  };

  const handleStartSession = () => {
    // TODO (Chat 4+): emit socket.io event to start the scene
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

      {isGM && (
        <div className="gm-controls">
          <button type="button" className="btn-start" onClick={handleStartSession}>
            Розпочати сесію
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

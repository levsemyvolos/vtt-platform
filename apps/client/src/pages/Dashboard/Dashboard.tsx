import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchRooms, createRoom, fetchRoom } from '../../store/room';
import { logout } from '../../store/session';
import type { RoomDTO } from '@vtt/shared';

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { currentUser } = useAppSelector((s) => s.session);
  const { ownRooms, status, error } = useAppSelector((s) => s.room);

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [gameSystem, setGameSystem] = useState('D&D 5e');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchRooms());
  }, [dispatch]);

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setCreateError(t('errors:validation.roomNameRequired'));
      return;
    }
    setCreateError(null);
    const result = await dispatch(createRoom({ name: roomName.trim(), gameSystem }));
    if (createRoom.fulfilled.match(result)) {
      setShowCreate(false);
      setRoomName('');
    }
  };

  const handleOpen = (room: RoomDTO) => {
    void dispatch(fetchRoom(room.id));
  };

  const handleLogout = () => {
    void dispatch(logout());
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>{t('room:dashboard.heading')}</h1>
        <div className="dashboard-user">
          <span>{currentUser?.name}</span>
          <button type="button" onClick={handleLogout}>
            {t('common:btn.logout')}
          </button>
        </div>
      </header>

      {status === 'loading' && <p className="loading">{t('common:status.loading')}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {ownRooms.length === 0 && status === 'loaded' && (
        <p className="empty">{t('room:dashboard.noRooms')}</p>
      )}

      <ul className="room-list">
        {ownRooms.map((room) => (
          <li key={room.id} className="room-card">
            <div className="room-card-info">
              <strong className="room-name">{room.name}</strong>
              <span className="room-system">{room.gameSystem}</span>
              <span className={`room-status status--${room.status}`}>
                {t(`room:status.${room.status}`)}
              </span>
              <span className="room-members">
                {t('room:dashboard.membersCount', { count: room.members.length })}
              </span>
            </div>
            <button type="button" onClick={() => handleOpen(room)}>
              {t('common:btn.open')}
            </button>
          </li>
        ))}
      </ul>

      {showCreate ? (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="create-room-form"
          aria-label={t('room:dashboard.formLabel')}
        >
          <h2>{t('room:dashboard.newRoomHeading')}</h2>
          <div className="field">
            <label htmlFor="room-name">{t('common:label.name')}</label>
            <input
              id="room-name"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="room-system">{t('common:label.gameSystem')}</label>
            <input
              id="room-system"
              type="text"
              value={gameSystem}
              onChange={(e) => setGameSystem(e.target.value)}
              required
            />
          </div>
          {createError && (
            <p role="alert" className="error">
              {createError}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={status === 'loading'}>
              {t('common:btn.create')}
            </button>
            <button type="button" onClick={() => setShowCreate(false)}>
              {t('common:btn.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-create" onClick={() => setShowCreate(true)}>
          {t('room:dashboard.createBtn')}
        </button>
      )}
    </div>
  );
}

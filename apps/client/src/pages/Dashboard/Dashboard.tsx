import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchRooms, createRoom, fetchRoom } from '../../store/room';
import { logout } from '../../store/session';
import type { RoomDTO } from '@vtt/shared';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { currentUser } = useAppSelector((s) => s.session);
  const { ownRooms, status, error } = useAppSelector((s) => s.room);

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [gameSystem, setGameSystem] = useState('D&D 5e');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => { void dispatch(fetchRooms()); }, [dispatch]);

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!roomName.trim()) { setCreateError(t('errors:validation.roomNameRequired')); return; }
    setCreateError(null);
    const result = await dispatch(createRoom({ name: roomName.trim(), gameSystem }));
    if (createRoom.fulfilled.match(result)) { setShowCreate(false); setRoomName(''); }
  };

  const handleOpen = (room: RoomDTO) => { void dispatch(fetchRoom(room.id)); };
  const handleLogout = () => { void dispatch(logout()); };

  function statusClass(s: string): string {
    return (s === 'active' ? styles.statusActive : styles.statusIdle) as string;
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1>{t('room:dashboard.heading')}</h1>
        <div className={styles.userArea}>
          <span>{currentUser?.name}</span>
          <button type="button" className={styles.btnLogout} onClick={handleLogout}>
            {t('common:btn.logout')}
          </button>
        </div>
      </header>

      {status === 'loading' && <p className={styles.loading}>{t('common:status.loading')}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {ownRooms.length === 0 && status === 'loaded' && (
        <p className={styles.empty}>{t('room:dashboard.noRooms')}</p>
      )}

      <ul className={styles.roomList}>
        {ownRooms.map((room) => (
          <li key={room.id} className={styles.roomCard} data-testid="room-card">
            <div className={styles.roomInfo}>
              <strong className={styles.roomName}>{room.name}</strong>
              <span className={styles.roomSystem}>{room.gameSystem}</span>
              <span className={`${styles.roomStatus} ${statusClass(room.status)}`}>
                {t(`room:status.${room.status}`)}
              </span>
              <span className={styles.roomMembers}>
                {t('room:dashboard.membersCount', { count: room.members.length })}
              </span>
            </div>
            <button type="button" className={styles.btnOpen} onClick={() => handleOpen(room)}>
              {t('common:btn.open')}
            </button>
          </li>
        ))}
      </ul>

      {showCreate ? (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className={styles.createForm}
          aria-label={t('room:dashboard.formLabel')}
        >
          <h2>{t('room:dashboard.newRoomHeading')}</h2>
          <div className={styles.field}>
            <label htmlFor="room-name">{t('common:label.name')}</label>
            <input
              id="room-name"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              required
              aria-required="true"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="room-system">{t('common:label.gameSystem')}</label>
            <input
              id="room-system"
              type="text"
              value={gameSystem}
              onChange={(e) => setGameSystem(e.target.value)}
              required
            />
          </div>
          {createError && <p role="alert" className={styles.fieldError}>{createError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnCreate} disabled={status === 'loading'}>
              {t('common:btn.create')}
            </button>
            <button type="button" className={styles.btnCancel} onClick={() => setShowCreate(false)}>
              {t('common:btn.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={styles.btnShowCreate} onClick={() => setShowCreate(true)}>
          {t('room:dashboard.createBtn')}
        </button>
      )}
    </div>
  );
}

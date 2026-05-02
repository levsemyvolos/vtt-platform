import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchRooms, fetchRoom } from '../../store/room';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Tabs, { type TabItem } from '../../components/ui/Tabs';
import { RoomCard, CreateRoomCard, CreateRoomModal } from '../../components/Dashboard';
import styles from './Dashboard.module.css';

type DashboardTab = 'my' | 'invited';

function partitionRooms(rooms: ReadonlyArray<RoomDTO>, currentUserId: string | null) {
  const my: RoomDTO[] = [];
  const invited: RoomDTO[] = [];
  for (const r of rooms) {
    const isOwner = r.ownerId === currentUserId;
    const me = currentUserId ? r.members.find((m) => m.userId === currentUserId) : null;
    const myRole = me?.role ?? null;
    if (isOwner || myRole === 'GM') my.push(r);
    else invited.push(r);
  }
  return { my, invited };
}

function roleOf(room: RoomDTO, currentUserId: string | null): 'GM' | 'Player' | 'Observer' | null {
  if (!currentUserId) return null;
  if (room.ownerId === currentUserId) return 'GM';
  return room.members.find((m) => m.userId === currentUserId)?.role ?? null;
}

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common']);
  const { currentUser } = useAppSelector((s) => s.session);
  const { ownRooms, status, error } = useAppSelector((s) => s.room);

  const [tab, setTab] = useState<DashboardTab>('my');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void dispatch(fetchRooms());
  }, [dispatch]);

  const { my, invited } = useMemo(
    () => partitionRooms(ownRooms, currentUser?.id ?? null),
    [ownRooms, currentUser?.id],
  );

  const activeRooms = ownRooms.filter((r) => r.status === 'active').length;

  const tabItems: ReadonlyArray<TabItem<DashboardTab>> = [
    { id: 'my', label: t('room:dashboard.tabs.my'), count: my.length },
    { id: 'invited', label: t('room:dashboard.tabs.invited'), count: invited.length },
  ];

  const visible = tab === 'my' ? my : invited;
  const filtered = search.trim()
    ? visible.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : visible;

  const handleOpen = (room: RoomDTO) => {
    void dispatch(fetchRoom(room.id));
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{t('room:dashboard.heading')}</h1>
          <p className={styles.subtitle}>
            {t('room:dashboard.subheading', { active: activeRooms, total: ownRooms.length })}
          </p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
          {t('room:dashboard.createBtn')}
        </Button>
      </header>

      <div className={styles.toolbar}>
        <Tabs<DashboardTab>
          variant="segmented"
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel={t('room:dashboard.heading')}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={16} />}
          placeholder={t('room:dashboard.search.placeholder')}
          aria-label={t('room:dashboard.search.placeholder')}
          className={styles.search}
        />
      </div>

      {status === 'loading' && <p className={styles.loading}>{t('common:status.loading')}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {tab === 'my' ? (
        <div className={styles.grid} data-testid="rooms-grid">
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              myRole={roleOf(room, currentUser?.id ?? null)}
              onOpen={handleOpen}
            />
          ))}
          <CreateRoomCard onClick={() => setCreateOpen(true)} />
        </div>
      ) : (
        <div className={styles.grid} data-testid="rooms-grid">
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>{t('room:dashboard.empty.invitedHeading')}</h2>
              <p className={styles.emptySubtitle}>{t('room:dashboard.empty.invitedSubheading')}</p>
            </div>
          ) : (
            filtered.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                myRole={roleOf(room, currentUser?.id ?? null)}
                onOpen={handleOpen}
              />
            ))
          )}
        </div>
      )}

      {createOpen && <CreateRoomModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

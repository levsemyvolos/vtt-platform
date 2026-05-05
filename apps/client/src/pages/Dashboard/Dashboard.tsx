import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchRooms } from '../../store/room';
import type { FetchRoomsOpts } from '../../store/room';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Tabs, { type TabItem } from '../../components/ui/Tabs';
import { RoomCard, CreateRoomCard, CreateRoomModal, SortDropdown } from '../../components/Dashboard';
import type { SortField, SortOrder } from '../../components/Dashboard';
import styles from './Dashboard.module.css';

type DashboardTab = 'my' | 'invited';

const ROOM_LIMIT = parseInt(import.meta.env.VITE_ROOM_LIMIT_PER_USER ?? '20', 10);

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

// eslint-disable-next-line complexity
export default function Dashboard() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { currentUser } = useAppSelector((s) => s.session);
  const { ownRooms, status, error } = useAppSelector((s) => s.room);

  const [tab, setTab] = useState<DashboardTab>('my');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sort, setSort] = useState<SortField>('lastActive');
  const [order, setOrder] = useState<SortOrder>('desc');

  // B6-BUG-002: pass sort/order/filter on mount so server-side sort is applied from the start.
  useEffect(() => {
    const opts: FetchRoomsOpts = { sort, order, filter: tab === 'my' ? 'owned' : 'invited' };
    void dispatch(fetchRooms(opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const { my, invited } = useMemo(
    () => partitionRooms(ownRooms, currentUser?.id ?? null),
    [ownRooms, currentUser?.id],
  );

  const activeRooms = ownRooms.filter((r) => r.status === 'active').length;
  const ownedCount = my.length;
  const limitReached = ownedCount >= ROOM_LIMIT;

  const tabItems: ReadonlyArray<TabItem<DashboardTab>> = [
    { id: 'my', label: t('room:dashboard.tabs.my'), count: my.length },
    { id: 'invited', label: t('room:dashboard.tabs.invited'), count: invited.length },
  ];

  const visible = tab === 'my' ? my : invited;
  const filtered = search.trim()
    ? visible.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : visible;

  const handleOpen = (room: RoomDTO) => {
    navigate(`/rooms/${room.id}`);
  };

  const handleSortChange = (newSort: SortField, newOrder: SortOrder) => {
    setSort(newSort);
    setOrder(newOrder);
    // B6-BUG-002: pass updated sort/order to fetchRooms so server re-sorts.
    const opts: FetchRoomsOpts = {
      sort: newSort,
      order: newOrder,
      filter: tab === 'my' ? 'owned' : 'invited',
    };
    void dispatch(fetchRooms(opts));
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{t('room:dashboard.heading')}</h1>
          <p className={styles.subtitle}>
            {t('room:dashboard.subheading', { active: activeRooms, total: ownRooms.length })}
          </p>
          {tab === 'my' && (
            <p className={styles.limitCounter}>
              {t('room:limitCounter', { used: ownedCount, limit: ROOM_LIMIT })}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setCreateOpen(true)}
          disabled={limitReached}
          title={limitReached ? t('errors:rooms.limitReached', { limit: ROOM_LIMIT }) : undefined}
        >
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
        <div className={styles.toolbarRight}>
          <SortDropdown sort={sort} order={order} onSortChange={handleSortChange} />
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
      </div>

      {status === 'loading' && <p className={styles.loading}>{t('common:status.loading')}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {/^[\w]+:[\w.]+$/.test(error) ? t(error as never, error) : error}
        </p>
      )}

      {tab === 'my' ? (
        <div className={styles.grid} data-testid="rooms-grid">
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              myRole={roleOf(room, currentUser?.id ?? null)}
              currentUserId={currentUser?.id ?? null}
              onOpen={handleOpen}
            />
          ))}
          <CreateRoomCard
            onClick={() => setCreateOpen(true)}
            disabled={limitReached}
          />
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
                currentUserId={currentUser?.id ?? null}
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

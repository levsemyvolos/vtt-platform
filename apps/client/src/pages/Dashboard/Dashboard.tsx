import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LogIn, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RoomDTO } from '@vtt/shared';
import Button from '../../components/ui/Button';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchRooms } from '../../store/room';
import type { FetchRoomsOpts } from '../../store/room';
import Input from '../../components/ui/Input';
import Tabs, { type TabItem } from '../../components/ui/Tabs';
import { RoomCard, CreateRoomCard, CreateRoomModal, JoinByCodeModal, SortDropdown } from '../../components/Dashboard';
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
  const [joinOpen, setJoinOpen] = useState(false);
  const [sort, setSort] = useState<SortField>('lastActive');
  const [order, setOrder] = useState<SortOrder>('desc');

  // Single fetch with filter='all' — partitionRooms() splits client-side, so both
  // tab counts are accurate immediately and tab switching needs no refetch.
  useEffect(() => {
    const opts: FetchRoomsOpts = { sort, order, filter: 'all' };
    void dispatch(fetchRooms(opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const { my, invited } = useMemo(
    () => partitionRooms(ownRooms, currentUser?.id ?? null),
    [ownRooms, currentUser?.id],
  );

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
    const opts: FetchRoomsOpts = {
      sort: newSort,
      order: newOrder,
      filter: 'all',
    };
    void dispatch(fetchRooms(opts));
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.pageHead}>
        <div className={styles.pageHeadRow}>
          <div>
            <div className="eyebrow accent">{t('room:dashboard.section')}</div>
            <h1 className={styles.pageTitle}>
              <Trans i18nKey="dashboard.title" ns="room" components={{ em: <em /> }} />
            </h1>
            <p className={styles.pageLede}>{t('room:dashboard.lede')}</p>
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              leftIcon={<LogIn size={16} strokeWidth={2} />}
              onClick={() => setJoinOpen(true)}
            >
              {t('room:dashboard.joinBtn')}
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus size={16} strokeWidth={2} />}
              onClick={() => setCreateOpen(true)}
              disabled={limitReached}
              title={limitReached ? t('errors:rooms.limitReached', { limit: ROOM_LIMIT }) : undefined}
            >
              {t('room:dashboard.createBtn')}
            </Button>
          </div>
        </div>
        <hr className="fold" />
      </div>

      <div className={styles.subBar}>
        <Tabs<DashboardTab>
          variant="segmented"
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel={t('room:dashboard.title')}
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
        <SortDropdown sort={sort} order={order} onSortChange={handleSortChange} />
        <div className={styles.subBarRight}>
          {status === 'loading' && (
            <span className={styles.loadingTag} aria-live="polite">
              {t('common:status.loading')}
            </span>
          )}
          <span className={styles.count}>
            {t('room:dashboard.count', { count: filtered.length })}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {/^[\w]+:[\w.]+$/.test(error) ? t(error as never, error) : error}
        </p>
      )}

      {tab === 'my' ? (
        <div className={styles.grid} data-testid="rooms-grid">
          <CreateRoomCard
            onClick={() => setCreateOpen(true)}
            disabled={limitReached}
          />
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              myRole={roleOf(room, currentUser?.id ?? null)}
              currentUserId={currentUser?.id ?? null}
              onOpen={handleOpen}
            />
          ))}
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
      {joinOpen && <JoinByCodeModal onClose={() => setJoinOpen(false)} />}
    </div>
  );
}

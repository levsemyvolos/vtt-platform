import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus } from 'lucide-react';
import type { Role } from '@vtt/shared';
import styles from './JournalPanel.module.css';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadEntries } from '../../store/journal';
import JournalEntryCard from './JournalEntryCard';
import JournalEditor from './JournalEditor';
import { Button } from '../ui';

interface Props {
  roomId: string;
  myRole: Role;
  myUserId: string;
}

type Filter = 'all' | 'private' | 'shared';

export default function JournalPanel({ roomId, myRole, myUserId: _myUserId }: Props): JSX.Element {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.journal.entries);
  const status = useAppSelector((s) => s.journal.status);
  const [filter, setFilter] = useState<Filter>('all');

  // T2 will mount editor; expose hook for selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { void dispatch(loadEntries(roomId)); }, [dispatch, roomId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.visibility === filter);
  }, [entries, filter]);

  return (
    <section className={styles.panel} aria-label={t('journal.heading')}>
      <header className={styles.header}>
        <span className={`eyebrow ${styles.eyebrow}`}>
          <BookOpen size={12} aria-hidden /> {t('journal.heading')}
        </span>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => { setSelectedId('__new__'); }}
          aria-label={t('journal.newBtn')}
        >
          {t('journal.newBtn')}
        </Button>
      </header>

      <div className={styles.filterChips} role="tablist" aria-label={t('journal.filterAriaLabel')}>
        <FilterChip label={t('journal.filterAll')}     active={filter === 'all'}     onClick={() => { setFilter('all'); }} />
        <FilterChip label={t('journal.filterPrivate')} active={filter === 'private'} onClick={() => { setFilter('private'); }} />
        <FilterChip label={t('journal.filterShared')}  active={filter === 'shared'}  onClick={() => { setFilter('shared'); }} />
      </div>

      {status === 'loading' && <p className={styles.empty}>{t('journal.loading')}</p>}
      {status === 'loaded' && filtered.length === 0 && <p className={styles.empty}>{t('journal.empty')}</p>}

      <ul className={styles.list}>
        {filtered.map((entry) => (
          <JournalEntryCard
            key={entry.id}
            entry={entry}
            myUserId={_myUserId}
            onClick={() => { setSelectedId(entry.id); }}
          />
        ))}
      </ul>

      {/* Journal editor modal */}
      {selectedId !== null && (
        <JournalEditor
          entryId={selectedId}
          roomId={roomId}
          myUserId={_myUserId}
          myRole={myRole}
          onClose={() => { setSelectedId(null); }}
        />
      )}
    </section>
  );
}

interface ChipProps { label: string; active: boolean; onClick: () => void; }
function FilterChip({ label, active, onClick }: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
    >
      {label}
    </button>
  );
}

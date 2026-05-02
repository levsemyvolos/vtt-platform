import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { InitiativeEntryDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  addEntryThunk,
  advanceTurnThunk,
  removeEntryThunk,
  reorderThunk,
} from '../../store/initiative';
import { loadMembers } from '../../store/members';
import { Button, IconButton, Avatar } from '../ui';
import styles from './InitiativeTracker.module.css';

interface InitiativeTrackerProps {
  sceneId: string;
  myRole: Role;
  roomId: string;
}

export default function InitiativeTracker({ sceneId, myRole, roomId }: InitiativeTrackerProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'errors']);
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.initiative.entries);
  const currentRound = useAppSelector((s) => s.initiative.currentRound);
  const membersState = useAppSelector((s) => s.members.byRoom[roomId]);
  const isGM = myRole === 'GM';

  const [showAdd, setShowAdd] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [customName, setCustomName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);
  const [initiative, setInitiative] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (isGM && roomId && !membersState) void dispatch(loadMembers(roomId));
  }, [isGM, roomId, membersState, dispatch]);

  function rollInitiative(dexMod = 0): number {
    const die = (crypto.getRandomValues(new Uint32Array(1))[0]! % 20) + 1;
    return die + dexMod;
  }

  function onOpenAdd(): void {
    setShowAdd(true); setSelectedMemberId(''); setCustomName('');
    setUseCustomName(false); setInitiative(rollInitiative()); setError(null);
  }

  async function onAdd(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = useCustomName
      ? customName.trim()
      : (() => {
          if (!selectedMemberId) return '';
          const all = [
            ...(membersState?.players ?? []),
            ...(membersState ? [membersState.gm] : []),
          ].filter(Boolean);
          return all.find((m) => m!.id === selectedMemberId)?.name ?? '';
        })();
    if (!name) { setError(t('errors:validation.selectMemberOrName')); return; }
    setBusy(true); setError(null);
    try {
      await dispatch(addEntryThunk({ sceneId, name, initiative })).unwrap();
      setShowAdd(false);
    } catch (err) {
      setError(typeof err === 'string' ? err : t('errors:network.generic'));
    } finally { setBusy(false); }
  }

  async function onRemove(entryId: string): Promise<void> {
    setError(null);
    try { await dispatch(removeEntryThunk({ sceneId, entryId })).unwrap(); }
    catch (err) { setError(typeof err === 'string' ? err : t('errors:network.generic')); }
  }

  async function onAdvance(): Promise<void> {
    setError(null);
    try { await dispatch(advanceTurnThunk({ sceneId })).unwrap(); }
    catch (err) { setError(typeof err === 'string' ? err : t('errors:network.generic')); }
  }

  function onDragEnd(e: DragEndEvent): void {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = entries.map((it) => it.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    dispatch(reorderThunk({ sceneId, orderedIds: arrayMove(ids, from, to) }));
  }

  const allMembers = membersState
    ? [membersState.gm, ...membersState.players].filter(Boolean)
    : [];

  function renderAddForm(): JSX.Element {
    return (
      <form onSubmit={(e) => void onAdd(e)} className={styles.addForm}>
        {allMembers.length > 0 && !useCustomName && (
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            aria-label={t('campaign:initiative.selectMemberLabel')}
          >
            <option value="">{t('campaign:initiative.selectMemberDefault')}</option>
            {allMembers.map((m) => (
              <option key={m!.id} value={m!.id}>{m!.name}</option>
            ))}
          </select>
        )}
        <label>
          <input
            type="checkbox"
            checked={useCustomName}
            onChange={(e) => setUseCustomName(e.target.checked)}
          />
          {' '}{t('campaign:initiative.customNameToggle')}
        </label>
        {useCustomName && (
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={t('campaign:initiative.namePlaceholder')}
            aria-label={t('campaign:initiative.nameLabel')}
          />
        )}
        <label>
          {t('campaign:initiative.initiativeLabel')}
          <input
            type="number"
            value={initiative}
            onChange={(e) => setInitiative(Number(e.target.value))}
            aria-label={t('campaign:initiative.initiativeAriaLabel')}
          />
        </label>
        <div className={styles.addActions}>
          <button
            type="button"
            onClick={() => setInitiative(rollInitiative())}
            aria-label={t('campaign:initiative.rollAriaLabel')}
          >
            D
          </button>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>OK</Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdd(false)}
            disabled={busy}
          >
            &times;
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.tracker} data-testid="initiative-tracker">
      <header className={styles.header}>
        <span className={`eyebrow ${styles.round}`}>
          {t('campaign:initiative.roundLabel', { round: currentRound })}
        </span>
        {isGM && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onAdvance()}
            disabled={busy || entries.length === 0}
            aria-label={t('campaign:initiative.nextTurnLabel')}
          >
            {t('campaign:initiative.nextTurnBtn')}
          </Button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>{t('campaign:initiative.empty')}</p>
      ) : isGM ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ul className={styles.list}>
              {entries.map((entry) => (
                <SortableEntry key={entry.id} entry={entry} onRemove={(id) => void onRemove(id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <ReadOnlyEntry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      {isGM && (
        <div>
          {!showAdd ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              fullWidth
              onClick={onOpenAdd}
              aria-label={t('campaign:initiative.addLabel')}
            >
              {t('campaign:initiative.addBtn')}
            </Button>
          ) : renderAddForm()}
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

interface RowProps {
  entry: InitiativeEntryDTO;
  onRemove?: (id: string) => void;
}

function SortableEntry({ entry, onRemove }: RowProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={`${styles.entry}${entry.isCurrent ? ` ${styles.entryActive}` : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className={styles.initiative}>{entry.initiative}</span>
      <Avatar size="sm" name={entry.name} className={styles.entryAvatar} />
      <span className={styles.entryName}>{entry.name}</span>
      {onRemove && (
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('initiative.deleteLabel', { name: entry.name })}
          onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
        >
          &times;
        </IconButton>
      )}
    </li>
  );
}

function ReadOnlyEntry({ entry }: RowProps): JSX.Element {
  return (
    <li className={`${styles.entry}${entry.isCurrent ? ` ${styles.entryActive}` : ''}`}>
      <span className={styles.initiative}>{entry.initiative}</span>
      <Avatar size="sm" name={entry.name} className={styles.entryAvatar} />
      <span className={styles.entryName}>{entry.name}</span>
    </li>
  );
}

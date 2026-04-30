import { useEffect, useState, type FormEvent } from 'react';
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

interface InitiativeTrackerProps {
  sceneId: string;
  myRole: Role;
  roomId: string;
}

/**
 * Трек ініціативи (Ф7.3). GM: drag-to-reorder, додавання через member-picker
 * або ручний ввід (1d20 + dexMod auto-roll), кнопка «Наступний хід»;
 * Player/Observer — лише перегляд.
 */
export default function InitiativeTracker({
  sceneId,
  myRole,
  roomId,
}: InitiativeTrackerProps): JSX.Element {
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
    if (isGM && roomId && !membersState) {
      void dispatch(loadMembers(roomId));
    }
  }, [isGM, roomId, membersState, dispatch]);

  function rollInitiative(dexMod = 0): number {
    return Math.floor(Math.random() * 20) + 1 + dexMod;
  }

  function onOpenAdd(): void {
    setShowAdd(true);
    setSelectedMemberId('');
    setCustomName('');
    setUseCustomName(false);
    setInitiative(rollInitiative());
    setError(null);
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
    if (!name) {
      setError('Оберіть учасника або введіть ім\'я');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dispatch(addEntryThunk({ sceneId, name, initiative })).unwrap();
      setShowAdd(false);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(entryId: string): Promise<void> {
    setError(null);
    try {
      await dispatch(removeEntryThunk({ sceneId, entryId })).unwrap();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Помилка');
    }
  }

  async function onAdvance(): Promise<void> {
    setError(null);
    try {
      await dispatch(advanceTurnThunk({ sceneId })).unwrap();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Помилка');
    }
  }

  function onDragEnd(e: DragEndEvent): void {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = entries.map((it) => it.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(ids, from, to);
    dispatch(reorderThunk({ sceneId, orderedIds: reordered }));
  }

  const allMembers = membersState
    ? [membersState.gm, ...membersState.players].filter(Boolean)
    : [];

  return (
    <div className="initiative-tracker">
      <header className="initiative-tracker__header">
        <span>Раунд: {currentRound}</span>
        {isGM && (
          <button
            type="button"
            onClick={onAdvance}
            disabled={busy || entries.length === 0}
            aria-label="Наступний хід"
          >
            Наступний хід
          </button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="initiative-tracker__empty">Список порожній.</p>
      ) : isGM ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ul className="initiative-tracker__list">
              {entries.map((entry) => (
                <SortableEntry key={entry.id} entry={entry} onRemove={onRemove} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="initiative-tracker__list">
          {entries.map((entry) => (
            <ReadOnlyEntry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      {isGM && (
        <div className="initiative-tracker__actions">
          {!showAdd ? (
            <button type="button" onClick={onOpenAdd} aria-label="Додати позицію">
              + Додати
            </button>
          ) : (
            <form onSubmit={onAdd} className="initiative-tracker__form">
              {allMembers.length > 0 && !useCustomName && (
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  aria-label="Оберіть учасника"
                >
                  <option value="">— учасник —</option>
                  {allMembers.map((m) => (
                    <option key={m!.id} value={m!.id}>
                      {m!.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="initiative-tracker__custom-toggle">
                <input
                  type="checkbox"
                  checked={useCustomName}
                  onChange={(e) => setUseCustomName(e.target.checked)}
                />
                Власне ім'я
              </label>
              {useCustomName && (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Ім'я (NPC, монстр…)"
                  aria-label="Ім'я учасника"
                />
              )}
              <label>
                Ініціатива
                <input
                  type="number"
                  value={initiative}
                  onChange={(e) => setInitiative(Number(e.target.value))}
                  aria-label="Значення ініціативи"
                />
              </label>
              <button
                type="button"
                onClick={() => setInitiative(rollInitiative())}
                title="1d20"
                aria-label="Кинути ініціативу (1d20)"
              >
                🎲
              </button>
              <button type="submit" disabled={busy}>OK</button>
              <button type="button" onClick={() => setShowAdd(false)} disabled={busy}>×</button>
            </form>
          )}
        </div>
      )}

      {error && <p className="initiative-tracker__error">{error}</p>}
    </div>
  );
}

interface RowProps {
  entry: InitiativeEntryDTO;
  onRemove?: (id: string) => void;
}

function SortableEntry({ entry, onRemove }: RowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`initiative-tracker__item${entry.isCurrent ? ' initiative-tracker__item--current' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="initiative-tracker__name">{entry.name}</span>
      <span className="initiative-tracker__value">{entry.initiative}</span>
      {entry.isCurrent && <span className="initiative-tracker__badge">current</span>}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(entry.id);
          }}
          aria-label={`Видалити ${entry.name}`}
        >
          ×
        </button>
      )}
    </li>
  );
}

function ReadOnlyEntry({ entry }: RowProps): JSX.Element {
  return (
    <li
      className={`initiative-tracker__item${entry.isCurrent ? ' initiative-tracker__item--current' : ''}`}
    >
      <span className="initiative-tracker__name">{entry.name}</span>
      <span className="initiative-tracker__value">{entry.initiative}</span>
      {entry.isCurrent && <span className="initiative-tracker__badge">current</span>}
    </li>
  );
}

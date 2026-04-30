import { useState, type FormEvent } from 'react';
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

interface InitiativeTrackerProps {
  sceneId: string;
  myRole: Role;
}

/**
 * Трек ініціативи (Ф7.3). GM має drag-to-reorder, додавання/видалення позицій
 * та кнопку «Наступний хід»; Player/Observer — лише перегляд.
 */
export default function InitiativeTracker({
  sceneId,
  myRole,
}: InitiativeTrackerProps): JSX.Element {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.initiative.entries);
  const currentRound = useAppSelector((s) => s.initiative.currentRound);
  const isGM = myRole === 'GM';

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function onAdd(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch(addEntryThunk({ sceneId, name: name.trim(), initiative })).unwrap();
      setName('');
      setInitiative(10);
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
                <SortableEntry
                  key={entry.id}
                  entry={entry}
                  onRemove={onRemove}
                />
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
            <button type="button" onClick={() => setShowAdd(true)} aria-label="Додати позицію">
              + Додати
            </button>
          ) : (
            <form onSubmit={onAdd} className="initiative-tracker__form">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ім'я"
                aria-label="Ім'я учасника"
                required
              />
              <input
                type="number"
                value={initiative}
                onChange={(e) => setInitiative(Number(e.target.value))}
                aria-label="Значення ініціативи"
                required
              />
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

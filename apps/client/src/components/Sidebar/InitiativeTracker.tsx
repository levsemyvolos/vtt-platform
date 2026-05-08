import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
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
import type { InitiativeEntryDTO, Role, TokenPublicDTO, StatusMarker } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  addEntryThunk,
  advanceTurnThunk,
  removeEntryThunk,
  reorderThunk,
} from '../../store/initiative';
import { loadMembers } from '../../store/members';
import { clearPendingAdd, setHoveredEntry } from '../../store/initiativeUi';
import { Button, IconButton, Avatar } from '../ui';
import TokenEditModal from '../Token/TokenEditModal';
import InitiativeEntryContextMenu from './InitiativeEntryContextMenu';
import InitiativeEntryEditModal from './InitiativeEntryEditModal';
import styles from './InitiativeTracker.module.css';

const EMPTY_TOKENS: [] = [];

/** Color map matching TokenLayer's STATUS_COLORS for visual consistency. */
const STATUS_CHIP_COLORS: Record<StatusMarker, string> = {
  blinded: '#212529', charmed: '#f783ac', deafened: '#9775fa', frightened: '#ff6b6b',
  grappled: '#f76707', incapacitated: '#e9ecef', invisible: '#dee2e6', paralyzed: '#74c0fc',
  petrified: '#adb5bd', poisoned: '#51cf66', prone: '#868e96',
  restrained: '#fd7e14', stunned: '#339af0', unconscious: '#495057',
};

/**
 * Pure helper — resolves name + optional tokenId from the add-entry form state.
 * Extracted to keep `onAdd` cyclomatic complexity ≤ 10 (lint gate).
 * Returns null when validation fails (caller shows the error).
 */
function resolveInitiativeEntry(
  mode: 'member' | 'npc',
  selectedMemberId: string,
  customName: string,
  selectedTokenId: string,
  members: { id?: string; name?: string }[],
  sceneTokens: { id: string; assignedUserId?: string | null }[],
): { name: string; tokenId?: string } | null {
  if (mode === 'member') {
    if (!selectedMemberId) return null;
    const member = members.find((m) => m?.id === selectedMemberId);
    const name = member?.name;
    if (!name) return null;
    const linked = sceneTokens.find((tk) => tk.assignedUserId === selectedMemberId);
    return { name, ...(linked ? { tokenId: linked.id } : {}) };
  }
  const name = customName.trim();
  if (!name) return null;
  return { name, ...(selectedTokenId ? { tokenId: selectedTokenId } : {}) };
}

// ---------------------------------------------------------------------------
// EntryStatusMarkers — i18n status marker badges (read-only)
// ---------------------------------------------------------------------------

interface EntryStatusMarkersProps {
  token: TokenPublicDTO | null;
}

function EntryStatusMarkers({ token }: EntryStatusMarkersProps): JSX.Element | null {
  const { t } = useTranslation('campaign');
  if (!token) return null;
  const markers = token.statusMarkers;
  if (!markers || markers.length === 0) return null;
  return (
    <span className={styles.markers} aria-label={t('initiative.markersAriaLabel', { defaultValue: 'Active conditions' })}>
      {markers.map((m) => (
        <span
          key={m}
          className={styles.marker}
          title={t(`markers.${m}.full`)}
          aria-label={t(`markers.${m}.full`)}
          style={{ background: STATUS_CHIP_COLORS[m] }}
        >
          {t(`markers.${m}.short`)}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EntryHpDisplay — read-only HP span
// ---------------------------------------------------------------------------

interface EntryHpDisplayProps {
  token: TokenPublicDTO | null;
}

function EntryHpDisplay({ token }: EntryHpDisplayProps): JSX.Element | null {
  if (!token) return null;
  if (token.hp === undefined && token.maxHp === undefined) return null;
  return (
    <span className={styles.hpCellReadonly}>
      {token.hp ?? '—'}/{token.maxHp ?? '—'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  const sceneTokens = useAppSelector((s) => s.scene.current?.tokens ?? EMPTY_TOKENS);
  const pendingAdd = useAppSelector((s) => s.initiativeUi.pendingAdd);

  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState<'member' | 'npc'>('member');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [customName, setCustomName] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [initiative, setInitiative] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (isGM && roomId && !membersState) void dispatch(loadMembers(roomId));
  }, [isGM, roomId, membersState, dispatch]);

  useEffect(() => {
    if (!pendingAdd) return;
    setMode('npc');
    setCustomName(pendingAdd.name);
    setSelectedTokenId(pendingAdd.tokenId);
    setInitiative(rollInitiative());
    setShowAdd(true);
    dispatch(clearPendingAdd());
  }, [pendingAdd, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  function rollInitiative(dexMod = 0): number {
    const die = (crypto.getRandomValues(new Uint32Array(1))[0]! % 20) + 1;
    return die + dexMod;
  }

  function onOpenAdd(): void {
    setShowAdd(true);
    setMode('member');
    setSelectedMemberId('');
    setCustomName('');
    setSelectedTokenId('');
    setInitiative(rollInitiative());
    setError(null);
  }

  async function onAdd(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const allMembersForResolve = [
      ...(membersState?.players ?? []),
      ...(membersState ? [membersState.gm] : []),
    ].filter(Boolean) as { id?: string; name?: string }[];
    const resolved = resolveInitiativeEntry(
      mode, selectedMemberId, customName, selectedTokenId, allMembersForResolve, sceneTokens,
    );
    if (!resolved) { setError(t('errors:validation.selectMemberOrName')); return; }
    const { name, tokenId } = resolved;
    setBusy(true); setError(null);
    try {
      await dispatch(addEntryThunk({
        sceneId,
        name,
        initiative,
        ...(tokenId ? { tokenId } : {}),
      })).unwrap();
      setShowAdd(false);
    } catch (err) {
      setError(typeof err === 'string' ? err : t('errors:network.generic'));
    } finally { setBusy(false); }
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
        <fieldset>
          <legend>{t('campaign:initiative.sourceSection')}</legend>
          <label>
            <input
              type="radio"
              name="initiative-source"
              value="member"
              checked={mode === 'member'}
              onChange={() => setMode('member')}
            />
            {' '}{t('campaign:initiative.sourceMember')}
          </label>
          <label>
            <input
              type="radio"
              name="initiative-source"
              value="npc"
              checked={mode === 'npc'}
              onChange={() => setMode('npc')}
            />
            {' '}{t('campaign:initiative.sourceNpc')}
          </label>
        </fieldset>

        {mode === 'member' && (
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

        {mode === 'npc' && (
          <>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={t('campaign:initiative.namePlaceholder')}
              aria-label={t('campaign:initiative.nameLabel')}
            />
            <label>
              {t('campaign:initiative.tokenPickerLabel')}
              <select
                value={selectedTokenId}
                onChange={(e) => setSelectedTokenId(e.target.value)}
              >
                <option value="">{t('campaign:initiative.tokenPickerNone')}</option>
                {sceneTokens.map((tk) => (
                  <option key={tk.id} value={tk.id}>{tk.name}</option>
                ))}
              </select>
            </label>
          </>
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
          <IconButton
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setInitiative(rollInitiative())}
            aria-label={t('campaign:initiative.rollAriaLabel')}
          >
            ⚄
          </IconButton>
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
                <SortableEntry
                  key={entry.id}
                  entry={entry}
                  myRole={myRole}
                  sceneId={sceneId}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <ReadOnlyEntry key={entry.id} entry={entry} myRole={myRole} />
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

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

interface RowProps {
  entry: InitiativeEntryDTO;
  myRole: Role;
  sceneId?: string;
}

interface CtxMenu {
  x: number;
  y: number;
}

function SortableEntry({ entry, myRole, sceneId }: RowProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });

  const token = useAppSelector((s) =>
    entry.tokenId ? (s.scene.current?.tokens.find((tk) => tk.id === entry.tokenId) ?? null) : null,
  );

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [editTokenOpen, setEditTokenOpen] = useState(false);

  function handleContextMenu(e: React.MouseEvent): void {
    if (myRole !== 'GM') return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function handleRemove(): void {
    if (!sceneId) return;
    void dispatch(removeEntryThunk({ sceneId, entryId: entry.id }));
  }

  return (
    <>
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
        className={`${styles.entry}${entry.isCurrent ? ` ${styles.entryActive}` : ''}`}
        onMouseEnter={() => dispatch(setHoveredEntry(entry.id))}
        onMouseLeave={() => dispatch(setHoveredEntry(null))}
        onContextMenu={handleContextMenu}
        {...attributes}
        {...listeners}
      >
        <span className={styles.initiative}>{entry.initiative}</span>
        <Avatar size="sm" name={entry.name} className={styles.entryAvatar} />
        <span className={styles.entryName}>{entry.name}</span>
        <EntryStatusMarkers token={token} />
        <EntryHpDisplay token={token} />
      </li>
      {ctxMenu && createPortal(
        <InitiativeEntryContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          hasToken={!!token}
          onEditEntry={() => setEditEntryOpen(true)}
          onEditToken={() => setEditTokenOpen(true)}
          onRemove={handleRemove}
          onClose={() => setCtxMenu(null)}
        />,
        document.body,
      )}
      {editEntryOpen && createPortal(
        <InitiativeEntryEditModal
          entry={entry}
          onClose={() => setEditEntryOpen(false)}
        />,
        document.body,
      )}
      {editTokenOpen && entry.tokenId && createPortal(
        <TokenEditModal
          tokenId={entry.tokenId}
          onClose={() => setEditTokenOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}

function ReadOnlyEntry({ entry }: RowProps): JSX.Element {
  const dispatch = useAppDispatch();

  const token = useAppSelector((s) =>
    entry.tokenId ? (s.scene.current?.tokens.find((tk) => tk.id === entry.tokenId) ?? null) : null,
  );

  return (
    <li
      className={`${styles.entry}${entry.isCurrent ? ` ${styles.entryActive}` : ''}`}
      onMouseEnter={() => dispatch(setHoveredEntry(entry.id))}
      onMouseLeave={() => dispatch(setHoveredEntry(null))}
    >
      <span className={styles.initiative}>{entry.initiative}</span>
      <Avatar size="sm" name={entry.name} className={styles.entryAvatar} />
      <span className={styles.entryName}>{entry.name}</span>
      <EntryStatusMarkers token={token} />
      <EntryHpDisplay token={token} />
    </li>
  );
}

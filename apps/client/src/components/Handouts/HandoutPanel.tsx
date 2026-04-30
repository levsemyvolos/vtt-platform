import { useEffect, useState, type FormEvent } from 'react';
import type { HandoutDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  createHandoutThunk,
  deleteHandoutThunk,
  grantHandoutThunk,
  loadHandouts,
  revokeHandoutThunk,
} from '../../store/handouts';
import { loadMembers } from '../../store/members';

interface HandoutPanelProps {
  roomId: string;
  myRole: Role;
}

/**
 * Панель handouts (Ф7.4). GM керує створенням / grant / revoke / delete;
 * Player бачить лише видані йому матеріали; Observer не бачить панелі взагалі.
 * Grant використовує member-picker з GET /rooms/:id/members (R6 γ-variant).
 */
export default function HandoutPanel({ roomId, myRole }: HandoutPanelProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.handouts.items);
  const membersState = useAppSelector((s) => s.members.byRoom[roomId]);

  useEffect(() => {
    if (myRole === 'Observer') return;
    void dispatch(loadHandouts(roomId));
  }, [roomId, myRole, dispatch]);

  useEffect(() => {
    if (myRole === 'GM' && !membersState) {
      void dispatch(loadMembers(roomId));
    }
  }, [myRole, roomId, membersState, dispatch]);

  if (myRole === 'Observer') return null;
  if (myRole === 'GM') return <GmView roomId={roomId} items={items} />;
  return <PlayerView items={items} />;
}

interface GmViewProps {
  roomId: string;
  items: HandoutDTO[];
}

function GmView({ roomId, items }: GmViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assetId, setAssetId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await dispatch(
        createHandoutThunk({
          roomId,
          req: { title, body, ...(assetId ? { assetId } : {}) },
        }),
      ).unwrap();
      setTitle('');
      setBody('');
      setAssetId('');
      setShowCreate(false);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Помилка створення');
    }
  }

  return (
    <section className="handout-panel handout-panel--gm" aria-label="Handouts (GM)">
      <header className="handout-panel__header">
        <h3>Handouts</h3>
        <button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Скасувати' : '+ Створити'}
        </button>
      </header>
      {showCreate && (
        <form onSubmit={onCreate} className="handout-panel__form">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Заголовок"
            aria-label="Заголовок handout"
            required
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Текст (Markdown)"
            aria-label="Тіло handout"
            rows={4}
            required
          />
          <input
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            placeholder="assetId (необов'язково)"
            aria-label="assetId (необов'язково)"
          />
          <button type="submit">Створити</button>
        </form>
      )}
      {error && <p className="handout-panel__error">{error}</p>}
      <ul className="handout-panel__list">
        {items.map((h) => (
          <GmHandoutCard key={h.id} handout={h} roomId={roomId} />
        ))}
      </ul>
    </section>
  );
}

function GmHandoutCard({
  handout,
  roomId,
}: {
  handout: HandoutDTO;
  roomId: string;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const membersState = useAppSelector((s) => s.members.byRoom[roomId]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const players = membersState?.players ?? [];
  const hasPlayers = players.length > 0;

  function togglePlayer(id: string): void {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onGrant(): void {
    const userIds = [...checkedIds];
    if (userIds.length === 0) return;
    dispatch(grantHandoutThunk({ handoutId: handout.id, userIds }));
    setCheckedIds(new Set());
  }

  return (
    <li className="handout-panel__card">
      <h4>{handout.title}</h4>
      <p>{handout.body}</p>
      {handout.assetUrl && (
        <a href={handout.assetUrl} target="_blank" rel="noopener noreferrer">
          Asset
        </a>
      )}
      <div className="handout-panel__recipients">
        <strong>Видано:</strong>{' '}
        {handout.recipientIds.length === 0 && <em>нікому</em>}
        {handout.recipientIds.map((uid) => (
          <span key={uid} className="handout-panel__recipient">
            {uid.slice(0, 8)}
            <button
              type="button"
              onClick={() =>
                dispatch(revokeHandoutThunk({ handoutId: handout.id, userId: uid }))
              }
              aria-label={`Відкликати у ${uid}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="handout-panel__grant">
        {hasPlayers ? (
          <>
            <fieldset className="handout-panel__member-picker">
              <legend>Видати гравцям</legend>
              {players.map((p) => (
                <label key={p.id} className="handout-panel__member-label">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(p.id)}
                    onChange={() => togglePlayer(p.id)}
                    aria-label={`Видати ${p.name}`}
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={onGrant}
              disabled={checkedIds.size === 0}
            >
              Grant
            </button>
          </>
        ) : (
          <p
            className="handout-panel__no-players"
            title="Гравці без персонажів не з'являються у списку (R6 γ-variant)"
          >
            Гравців без персонажів немає — попросіть учасників створити персонажа.
          </p>
        )}
      </div>
      <button
        type="button"
        className="handout-panel__delete"
        onClick={() => dispatch(deleteHandoutThunk(handout.id))}
        aria-label={`Видалити handout ${handout.title}`}
      >
        Видалити
      </button>
    </li>
  );
}

function PlayerView({ items }: { items: HandoutDTO[] }): JSX.Element {
  return (
    <section className="handout-panel handout-panel--player" aria-label="Handouts">
      <header className="handout-panel__header"><h3>Handouts</h3></header>
      {items.length === 0 ? (
        <p className="handout-panel__empty">Поки що нічого не видано.</p>
      ) : (
        <ul className="handout-panel__list">
          {items.map((h) => (
            <li key={h.id} className="handout-panel__card">
              <h4>{h.title}</h4>
              <p>{h.body}</p>
              {h.assetUrl && (
                <a href={h.assetUrl} target="_blank" rel="noopener noreferrer">
                  Завантажити вкладений файл
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

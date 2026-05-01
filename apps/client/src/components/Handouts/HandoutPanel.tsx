import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { HandoutDTO, Role } from '@vtt/shared';
import styles from './HandoutPanel.module.css';
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
  const { t } = useTranslation(['campaign', 'common', 'errors']);
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
      setError(typeof err === 'string' ? err : t('errors:network.createFailed'));
    }
  }

  return (
    <section className={styles.panel} aria-label={t('campaign:handouts.gmAriaLabel')}>
      <header className={styles.header}>
        <h3>{t('campaign:handouts.heading')}</h3>
        <button type="button" className={styles.btn} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t('common:btn.cancel') : t('campaign:handouts.createBtn')}
        </button>
      </header>
      {showCreate && (
        <form onSubmit={(e) => void onCreate(e)} className={styles.createForm}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('campaign:handouts.titlePlaceholder')}
            aria-label={t('campaign:handouts.titleAriaLabel')}
            required
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('campaign:handouts.bodyPlaceholder')}
            aria-label={t('campaign:handouts.bodyAriaLabel')}
            rows={4}
            required
          />
          <input
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            placeholder={t('campaign:handouts.assetIdPlaceholder')}
            aria-label={t('campaign:handouts.assetIdAriaLabel')}
          />
          <button type="submit">{t('common:btn.create')}</button>
        </form>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <ul className={styles.list}>
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
  const { t } = useTranslation(['campaign', 'common']);
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
    <li className={styles.item}>
      <h4 className={styles.itemTitle}>{handout.title}</h4>
      <p className={styles.itemBody}>{handout.body}</p>
      {handout.assetUrl && (
        <a href={handout.assetUrl} target="_blank" rel="noopener noreferrer">
          Asset
        </a>
      )}
      <div>
        <strong>{t('handouts.grantedLabel')}</strong>{' '}
        {handout.recipientIds.length === 0 && <em>{t('handouts.noneGranted')}</em>}
        {handout.recipientIds.map((uid) => (
          <span key={uid} className={styles.granted}>
            {uid.slice(0, 8)}
            <button
              type="button"
              className={styles.btn}
              onClick={() =>
                dispatch(revokeHandoutThunk({ handoutId: handout.id, userId: uid }))
              }
              aria-label={t('handouts.revokeLabel', { uid })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className={styles.actions}>
        {hasPlayers ? (
          <>
            <fieldset className={styles.grantSelect}>
              <legend>{t('handouts.grantToPlayersLegend')}</legend>
              {players.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={checkedIds.has(p.id)}
                    onChange={() => togglePlayer(p.id)}
                    aria-label={t('handouts.grantLabel', { name: p.name })}
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className={styles.btn}
              onClick={onGrant}
              disabled={checkedIds.size === 0}
            >
              {t('handouts.grantBtn')}
            </button>
          </>
        ) : (
          <p>
            {t('handouts.noPlayers')}
          </p>
        )}
      </div>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnDanger}`}
        onClick={() => dispatch(deleteHandoutThunk(handout.id))}
        aria-label={t('handouts.deleteLabel', { title: handout.title })}
      >
        {t('common:btn.delete')}
      </button>
    </li>
  );
}

function PlayerView({ items }: { items: HandoutDTO[] }): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <section className={styles.panel} aria-label={t('handouts.playerAriaLabel')}>
      <header className={styles.header}>
        <h3>{t('handouts.heading')}</h3>
      </header>
      {items.length === 0 ? (
        <p className={styles.empty}>{t('handouts.emptyPlayer')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((h) => (
            <li key={h.id} className={styles.item}>
              <h4 className={styles.itemTitle}>{h.title}</h4>
              <p className={styles.itemBody}>{h.body}</p>
              {h.assetUrl && (
                <a href={h.assetUrl} target="_blank" rel="noopener noreferrer">
                  {t('handouts.downloadAttachment')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

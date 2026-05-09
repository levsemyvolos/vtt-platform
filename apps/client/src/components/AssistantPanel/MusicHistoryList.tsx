import { useEffect, useState, useCallback, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import { listAiAssets, renameAsset } from '../../api/assets';
import { useSaveAiAudio } from '../../hooks/useSaveAiAudio';
import { useAppDispatch } from '../../store';
import { addToast } from '../../store/toast';
import styles from './MusicHistoryList.module.css';

interface Props {
  roomId: string;
  /**
   * Bumped by parent whenever a new music generation completes — used as a
   * useEffect dep to trigger refetch. Optional; if absent, list refreshes only
   * on mount + roomId change (same staleness pattern as RecentGenerations).
   */
  refreshTrigger?: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * S5.5 P2 — single history-row component.
 *
 * Hosts its own `useSaveAiAudio` instance so each row's Save / Play
 * pending+saved state stays independent (a hook may not be called in a
 * loop in the parent). Title sent to /audio/from-asset is the persisted
 * asset.name (mood-derived from S5.5 P1) so room-track titles and
 * sidebar titles converge.
 */
function HistoryItem({
  asset,
  roomId,
  onRenamed,
}: {
  asset: AssetDTO;
  roomId: string;
  /** Optimistic-update callback: parent replaces the asset in the list. */
  onRenamed: (next: AssetDTO) => void;
}): JSX.Element {
  const { t } = useTranslation('assistant');
  const dispatch = useAppDispatch();
  const { pending, savedTrackId, save } = useSaveAiAudio(roomId, asset.id, asset.name);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(asset.name);
  const [renameBusy, setRenameBusy] = useState(false);

  function startEdit(): void {
    setDraftName(asset.name);
    setEditingName(true);
  }

  async function commitRename(): Promise<void> {
    const next = draftName.trim();
    if (!next || next === asset.name || renameBusy) {
      setEditingName(false);
      return;
    }
    setRenameBusy(true);
    try {
      const updated = await renameAsset(asset.id, next.slice(0, 128));
      onRenamed(updated);
      setEditingName(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('musicHistory.renameError');
      dispatch(addToast('error', msg));
    } finally {
      setRenameBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
    else if (e.key === 'Escape') { e.preventDefault(); setEditingName(false); setDraftName(asset.name); }
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemNameRow}>
        {editingName ? (
          <input
            type="text"
            className={styles.itemNameInput}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={onKey}
            disabled={renameBusy}
            maxLength={128}
            autoFocus
            aria-label={t('musicHistory.renameLabel')}
          />
        ) : (
          <>
            <p className={styles.itemName} title={asset.aiPrompt ?? asset.name}>{asset.name}</p>
            <button
              type="button"
              className={styles.renameBtn}
              onClick={startEdit}
              aria-label={t('musicHistory.renameLabel')}
              title={t('musicHistory.renameLabel')}
            >
              ✎
            </button>
          </>
        )}
      </div>
      <p className={styles.itemDate}>{formatDate(asset.createdAt)}</p>
      <audio controls preload="none" src={asset.url} className={styles.itemAudio}>
        {t('conversation.audioUnsupported')}
      </audio>
      <div className={styles.itemActions} role="group" aria-label={t('musicResult.groupLabel')}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionPrimary}`}
          onClick={() => void save(false)}
          disabled={pending !== null || savedTrackId !== null}
          title={t('musicResult.saveLabel')}
        >
          {savedTrackId !== null
            ? t('musicResult.savedLabel')
            : pending === 'save'
            ? t('musicResult.savingLabel')
            : t('musicResult.saveLabel')}
        </button>
      </div>
    </div>
  );
}

export default function MusicHistoryList({ roomId, refreshTrigger = 0 }: Props): JSX.Element {
  const { t } = useTranslation('assistant');
  const [items, setItems] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const dtos = await listAiAssets(roomId, 'audio');
      // Sort newest first; listAiAssets returns DESC by createdAt already, but pin it.
      dtos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(dtos);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('musicHistory.error'));
    } finally {
      setLoading(false);
    }
  }, [roomId, t]);

  useEffect(() => { void fetchHistory(); }, [fetchHistory, refreshTrigger]);

  return (
    <aside className={styles.list} aria-label={t('musicHistory.heading')}>
      <div className={styles.heading}>
        <span>{t('musicHistory.heading')}</span>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void fetchHistory()}
          disabled={loading}
          aria-label={t('musicHistory.refresh')}
          title={t('musicHistory.refresh')}
        >
          ↻
        </button>
      </div>
      <div className={styles.scroll}>
        {loading && items.length === 0 && <p className={styles.empty}>{t('musicHistory.loading')}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className={styles.empty}>{t('musicHistory.empty')}</p>
        )}
        {items.map((it) => (
          <HistoryItem
            key={it.id}
            asset={it}
            roomId={roomId}
            onRenamed={(next) =>
              setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))
            }
          />
        ))}
      </div>
    </aside>
  );
}

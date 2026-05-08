import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { JournalEntryDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { grantEntryThunk } from '../../store/journal';
import styles from './ShareModal.module.css';

interface Props {
  entry: JournalEntryDTO;
  onClose: () => void;
}

export default function ShareModal({ entry, onClose }: Props): JSX.Element {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const allMembers = useAppSelector((s) => s.room.members);
  const players = allMembers.filter(
    (m) => m.role !== 'GM' && m.role !== 'Observer',
  );
  const allPlayerIds = players.map((p) => p.userId);

  const [selected, setSelected] = useState<string[]>(entry.recipientIds);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === backdropRef.current) onClose();
  }

  async function handleShareAll(): Promise<void> {
    setBusy(true);
    try {
      await dispatch(
        grantEntryThunk({ id: entry.id, req: { userIds: allPlayerIds } }),
      ).unwrap();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await dispatch(
        grantEntryThunk({ id: entry.id, req: { userIds: selected } }),
      ).unwrap();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(): Promise<void> {
    setBusy(true);
    try {
      await dispatch(
        grantEntryThunk({ id: entry.id, req: { userIds: [] } }),
      ).unwrap();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function togglePlayer(userId: string): void {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdropClick}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('journal.share.heading', { title: entry.title })}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.heading}>
            {t('journal.share.heading', { title: entry.title })}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('journal.share.cancelBtn')}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Share all quick action */}
          <button
            type="button"
            className={styles.shareAllBtn}
            onClick={() => { void handleShareAll(); }}
            disabled={busy || allPlayerIds.length === 0}
          >
            {t('journal.share.shareWithAll')}
          </button>

          {allPlayerIds.length > 0 && (
            <>
              <div className={styles.divider}>
                {t('common.or', { defaultValue: 'or' })}
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                className={styles.advancedToggle}
                onClick={() => setAdvancedOpen((o) => !o)}
              >
                <span>{advancedOpen ? '▾' : '▸'}</span>
                {t('journal.share.advancedToggle')}
                {selected.length > 0 && (
                  <span className={styles.selectedCount}>
                    {t('journal.share.selectedCount', { count: selected.length })}
                  </span>
                )}
              </button>

              {advancedOpen && (
                <ul className={styles.playerList} role="group" aria-label={t('journal.share.advancedToggle')}>
                  {players.map((player) => (
                    <li key={player.userId} className={styles.playerItem}>
                      <input
                        type="checkbox"
                        id={`share-player-${player.userId}`}
                        className={styles.playerCheckbox}
                        checked={selected.includes(player.userId)}
                        onChange={() => togglePlayer(player.userId)}
                      />
                      <label
                        htmlFor={`share-player-${player.userId}`}
                        className={styles.playerName}
                      >
                        {player.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {allPlayerIds.length === 0 && (
            <p className={styles.emptyPlayers}>
              {t('journal.share.noPlayers')}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.revokeBtn}
            onClick={() => { void handleRevoke(); }}
            disabled={busy}
          >
            {t('journal.share.revokeBtn')}
          </button>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
          >
            {t('journal.share.cancelBtn')}
          </button>
          {advancedOpen && (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => { void handleSave(); }}
              disabled={busy}
            >
              {t('journal.share.saveBtn')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

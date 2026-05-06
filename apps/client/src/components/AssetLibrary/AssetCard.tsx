import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import styles from './AssetCard.module.css';

export interface AssetCardActions {
  /** Set this asset as the scene background. Optional — hidden if absent. */
  onSetBackground?: ((asset: AssetDTO) => void) | undefined;
  /** Add this asset as an overlay on the active scene. Optional. */
  onAddToScene?: ((asset: AssetDTO) => void) | undefined;
  /** Delete the asset (with confirm). Optional. */
  onDelete?: ((asset: AssetDTO) => void) | undefined;
  /** Rename the asset. Returns a promise so the input can show a loading state. */
  onRename?: ((asset: AssetDTO, name: string) => Promise<void> | void) | undefined;
  /** Generic "pick this asset" action — used when embedded in a picker (e.g. token image). */
  onPick?: ((asset: AssetDTO) => void) | undefined;
  /** Label for the onPick button. Default: "Pick". */
  pickLabel?: string | undefined;
}

interface AssetCardProps extends AssetCardActions {
  asset: AssetDTO;
  /** When set, this card shows the "Active" badge. */
  isActiveBackground?: boolean | undefined;
}

function formatType(mime: string): string {
  // image/png → PNG; audio/mpeg → MPEG; application/pdf → PDF
  const sub = mime.split('/').pop() ?? mime;
  return sub.toUpperCase();
}

export default function AssetCard({
  asset,
  isActiveBackground,
  onSetBackground,
  onAddToScene,
  onDelete,
  onRename,
  onPick,
  pickLabel,
}: AssetCardProps): JSX.Element {
  const { t } = useTranslation('room');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(asset.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(asset.name);
  }, [asset.name]);

  function startEditing(): void {
    if (onRename) setEditing(true);
  }

  async function commitEdit(): Promise<void> {
    const next = draft.trim();
    if (!next || next === asset.name) {
      setEditing(false);
      setDraft(asset.name);
      return;
    }
    try {
      await onRename?.(asset, next);
    } finally {
      setEditing(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') void commitEdit();
    else if (e.key === 'Escape') {
      setDraft(asset.name);
      setEditing(false);
    }
  }

  const isImage = asset.type.startsWith('image/');
  const isAudio = asset.type.startsWith('audio/');

  return (
    <div className={`${styles.card} ${isActiveBackground ? styles.cardActive : ''}`}>
      <div className={styles.thumbWrap}>
        {isImage ? (
          <img src={asset.url} alt={asset.name} className={styles.thumb} loading="lazy" />
        ) : isAudio ? (
          <div className={styles.thumbAudio} aria-label={asset.type}>♪</div>
        ) : (
          <div className={styles.thumbDoc} aria-label={asset.type}>📄</div>
        )}
        {isActiveBackground ? (
          <span className={styles.activeBadge}>{t('sceneEditor.assetLibrary.active')}</span>
        ) : null}
        <div className={styles.actions}>
          {onPick && isImage ? (
            <button type="button" className={styles.actionBtn} onClick={() => onPick(asset)}>
              {pickLabel ?? 'Pick'}
            </button>
          ) : null}
          {onSetBackground && isImage ? (
            <button type="button" className={styles.actionBtn} onClick={() => onSetBackground(asset)}>
              {t('sceneEditor.assetLibrary.useAsBackground')}
            </button>
          ) : null}
          {onAddToScene && isImage ? (
            <button type="button" className={styles.actionBtn} onClick={() => onAddToScene(asset)}>
              {t('sceneEditor.assetLibrary.addToScene')}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={() => {
                if (window.confirm(t('sceneEditor.assetLibrary.deleteConfirm', { name: asset.name }))) {
                  onDelete(asset);
                }
              }}
            >
              {t('sceneEditor.assetLibrary.delete')}
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          className={styles.nameInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={handleKey}
          maxLength={128}
          aria-label={t('sceneEditor.assetLibrary.rename')}
        />
      ) : (
        <span
          className={styles.name}
          title={asset.name}
          onDoubleClick={startEditing}
        >
          {asset.name}
        </span>
      )}
      <span className={styles.meta}>{formatType(asset.type)}</span>
    </div>
  );
}

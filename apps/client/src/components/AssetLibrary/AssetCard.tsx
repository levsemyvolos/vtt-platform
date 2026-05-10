import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import ConfirmModal from '../common/ConfirmModal';
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

/** Renders the type-appropriate thumbnail (image/audio/document).
 *  Extracted from AssetCard to keep cyclomatic complexity ≤ 10 (lint gate). */
function AssetThumb({ asset, isImage, isAudio }: { asset: AssetDTO; isImage: boolean; isAudio: boolean }): JSX.Element {
  if (isImage) return <img src={asset.url} alt={asset.name} className={styles.thumb} loading="lazy" />;
  if (isAudio) return <div className={styles.thumbAudio} aria-label={asset.type}>♪</div>;
  return <div className={styles.thumbDoc} aria-label={asset.type}>📄</div>;
}

interface AssetActionsRowProps {
  asset: AssetDTO;
  isImage: boolean;
  pickLabel?: string | undefined;
  deleteLabel: string;
  useAsBackgroundLabel: string;
  addToSceneLabel: string;
  onPick?: ((asset: AssetDTO) => void) | undefined;
  onSetBackground?: ((asset: AssetDTO) => void) | undefined;
  onAddToScene?: ((asset: AssetDTO) => void) | undefined;
  onDeleteRequest?: ((asset: AssetDTO) => void) | undefined;
}

/** Action buttons rendered over the thumbnail (pick, set bg, add, delete).
 *  Extracted to keep AssetCard cyclomatic complexity ≤ 10 (lint gate). */
function AssetActionsRow(props: AssetActionsRowProps): JSX.Element {
  const { asset, isImage, pickLabel, deleteLabel, useAsBackgroundLabel, addToSceneLabel,
    onPick, onSetBackground, onAddToScene, onDeleteRequest } = props;
  return (
    <div className={styles.actions}>
      {onPick && isImage ? (
        <button type="button" className={styles.actionBtn} onClick={() => onPick(asset)}>
          {pickLabel ?? 'Pick'}
        </button>
      ) : null}
      {onSetBackground && isImage ? (
        <button type="button" className={styles.actionBtn} onClick={() => onSetBackground(asset)}>
          {useAsBackgroundLabel}
        </button>
      ) : null}
      {onAddToScene && isImage ? (
        <button type="button" className={styles.actionBtn} onClick={() => onAddToScene(asset)}>
          {addToSceneLabel}
        </button>
      ) : null}
      {onDeleteRequest ? (
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          onClick={() => onDeleteRequest(asset)}
        >
          {deleteLabel}
        </button>
      ) : null}
    </div>
  );
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
  const [pendingDelete, setPendingDelete] = useState(false);
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

  const cardClass = `${styles.card} ${isActiveBackground ? styles.cardActive : ''}`;

  return (
    <div className={cardClass}>
      <div className={styles.thumbWrap}>
        <AssetThumb asset={asset} isImage={isImage} isAudio={isAudio} />
        {isActiveBackground ? (
          <span className={styles.activeBadge}>{t('sceneEditor.assetLibrary.active')}</span>
        ) : null}
        <AssetActionsRow
          asset={asset}
          isImage={isImage}
          pickLabel={pickLabel}
          deleteLabel={t('sceneEditor.assetLibrary.delete')}
          useAsBackgroundLabel={t('sceneEditor.assetLibrary.useAsBackground')}
          addToSceneLabel={t('sceneEditor.assetLibrary.addToScene')}
          onPick={onPick}
          onSetBackground={onSetBackground}
          onAddToScene={onAddToScene}
          onDeleteRequest={onDelete ? () => setPendingDelete(true) : undefined}
        />
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
      <ConfirmModal
        open={pendingDelete}
        title={t('sceneEditor.assetLibrary.delete')}
        message={t('sceneEditor.assetLibrary.deleteConfirm', { name: asset.name })}
        confirmLabel={t('common:btn.delete')}
        variant="danger"
        onConfirm={() => { setPendingDelete(false); onDelete?.(asset); }}
        onClose={() => setPendingDelete(false)}
      />
    </div>
  );
}

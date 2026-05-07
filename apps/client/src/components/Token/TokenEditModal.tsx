import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatusMarker, AssetDTO } from '@vtt/shared';
import { ALL_STATUS_MARKERS } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { upsertToken } from '../../store/scene';
import { apiUpdateToken } from '../../api/scenes';
import ImageUpload from '../AssetUpload/ImageUpload';
import AssetLibrary from '../AssetLibrary/AssetLibrary';
import styles from './TokenEditModal.module.css';

const COLOR_PRESETS = [
  '#7c5cff', '#ff6b6b', '#51cf66', '#339af0',
  '#ffd43b', '#f76707', '#cc5de8', '#495057',
];

interface TokenEditModalProps {
  tokenId: string;
  onClose: () => void;
}

interface TokenImageSectionProps {
  imagePreviewUrl: string | null;
  showUploader: boolean;
  showLibrary: boolean;
  roomId: string;
  saving: boolean;
  fieldLabel: string;
  changeImageLabel: string;
  uploadImageLabel: string;
  pickFromLibraryLabel: string;
  imagePreviewAlt: string;
  pickerLabel: string;
  onImageUploaded: (asset: AssetDTO) => void;
  onShowUploader: () => void;
  onShowLibrary: () => void;
}

/** Token-image picker section (preview, uploader, library).
 *  Extracted from TokenEditModal to keep cyclomatic complexity ≤ 10 (lint gate). */
function TokenImageSection(props: TokenImageSectionProps): JSX.Element {
  const { imagePreviewUrl, showUploader, showLibrary, roomId, saving,
    fieldLabel, changeImageLabel, uploadImageLabel, pickFromLibraryLabel,
    imagePreviewAlt, pickerLabel,
    onImageUploaded, onShowUploader, onShowLibrary } = props;
  const showPreview = imagePreviewUrl !== null && !showUploader;
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{fieldLabel}</span>
      {showPreview ? (
        <div style={{ marginBottom: 'var(--space-xs)' }}>
          <img
            src={imagePreviewUrl ?? ''}
            alt={imagePreviewAlt}
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
          />
        </div>
      ) : null}
      {renderImagePicker({
        showUploader, showLibrary, roomId, saving, imagePreviewUrl,
        changeImageLabel, uploadImageLabel, pickFromLibraryLabel, pickerLabel,
        onImageUploaded, onShowUploader, onShowLibrary,
      })}
    </div>
  );
}

interface ImagePickerArgs {
  showUploader: boolean;
  showLibrary: boolean;
  roomId: string;
  saving: boolean;
  imagePreviewUrl: string | null;
  changeImageLabel: string;
  uploadImageLabel: string;
  pickFromLibraryLabel: string;
  pickerLabel: string;
  onImageUploaded: (asset: AssetDTO) => void;
  onShowUploader: () => void;
  onShowLibrary: () => void;
}

/** Renders the uploader, library, or picker buttons depending on UI state. */
function renderImagePicker(a: ImagePickerArgs): JSX.Element {
  if (a.showUploader && a.roomId) {
    return <ImageUpload roomId={a.roomId} onUploaded={a.onImageUploaded} />;
  }
  if (a.showLibrary && a.roomId) {
    return (
      <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-xs)' }}>
        <AssetLibrary
          roomId={a.roomId}
          tabs={['images']}
          pickLabel={a.pickerLabel}
          onPick={a.onImageUploaded}
        />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
      <button
        type="button"
        className={styles.btnCancel}
        style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-xs) var(--space-sm)' }}
        onClick={a.onShowUploader}
        disabled={a.saving || !a.roomId}
      >
        {a.imagePreviewUrl ? a.changeImageLabel : a.uploadImageLabel}
      </button>
      <button
        type="button"
        className={styles.btnCancel}
        style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-xs) var(--space-sm)' }}
        onClick={a.onShowLibrary}
        disabled={a.saving || !a.roomId}
      >
        {a.pickFromLibraryLabel}
      </button>
    </div>
  );
}

export default function TokenEditModal({ tokenId, onClose }: TokenEditModalProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const token = useAppSelector((s) => s.scene.current?.tokens.find((tk) => tk.id === tokenId));
  const members = useAppSelector((s) => s.room.members);
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const dialogRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [hp, setHp] = useState('');
  const [maxHp, setMaxHp] = useState('');
  const [color, setColor] = useState('#7c5cff');
  const [markers, setMarkers] = useState<StatusMarker[]>([]);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setName(token.name);
    setHp(token.hp != null ? String(token.hp) : '');
    setMaxHp(token.maxHp != null ? String(token.maxHp) : '');
    setColor(token.color ?? '#7c5cff');
    setMarkers((token.statusMarkers ?? []) as StatusMarker[]);
    setAssignedUserId(token.assignedUserId ?? '');
    // Reset image state on token change
    setImageAssetId(null);
    setImagePreviewUrl(token.imageUrl || null);
    setShowUploader(false);
    setShowLibrary(false);
  }, [token]);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!token) return null;

  function toggleMarker(m: StatusMarker): void {
    setMarkers((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  function handleImageUploaded(asset: AssetDTO): void {
    setImageAssetId(asset.id);
    setImagePreviewUrl(asset.url);
    setShowUploader(false);
    setShowLibrary(false);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiUpdateToken(tokenId, {
        name: name.trim() || token!.name,
        hp: hp !== '' ? Number(hp) : null,
        maxHp: maxHp !== '' ? Number(maxHp) : null,
        color,
        statusMarkers: markers,
        assignedUserId: assignedUserId || null,
        ...(imageAssetId !== null ? { imageAssetId } : {}),
      });
      dispatch(upsertToken(updated));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors:network.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('room:token.editHeading')}
        tabIndex={-1}
        className={styles.dialog}
      >
        <h3 className={styles.heading}>{t('room:token.editHeading')}</h3>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('common:label.name')}</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t('common:label.name')}
            maxLength={60}
          />
        </label>

        <TokenImageSection
          imagePreviewUrl={imagePreviewUrl}
          showUploader={showUploader}
          showLibrary={showLibrary}
          roomId={roomId}
          saving={saving}
          fieldLabel={t('room:token.imageLabel')}
          changeImageLabel={t('room:token.changeImage')}
          uploadImageLabel={t('room:token.uploadImage')}
          pickFromLibraryLabel={t('room:token.pickFromLibrary')}
          imagePreviewAlt={t('room:token.imagePreviewAlt')}
          pickerLabel={t('room:token.useForToken')}
          onImageUploaded={handleImageUploaded}
          onShowUploader={() => setShowUploader(true)}
          onShowLibrary={() => setShowLibrary(true)}
        />

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>HP</span>
            <input
              type="number"
              className={styles.input}
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              aria-label="HP"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Max HP</span>
            <input
              type="number"
              className={styles.input}
              value={maxHp}
              onChange={(e) => setMaxHp(e.target.value)}
              aria-label="Max HP"
            />
          </label>
        </div>

        <div className={styles.colorSection}>
          <span className={styles.fieldLabel}>{t('room:token.colorLabel')}</span>
          <div className={styles.colorSwatches}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.swatch}${color === c ? ` ${styles['swatch--active']}` : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`${t('room:token.colorLabel')} ${c}`}
                aria-pressed={color === c}
              />
            ))}
          </div>
        </div>

        <div className={styles.markerSection}>
          <span className={styles.fieldLabel}>{t('room:token.statusLabel')}</span>
          <div className={styles.markerList}>
            {ALL_STATUS_MARKERS.map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.marker}${markers.includes(m) ? ` ${styles['marker--active']}` : ''}`}
                onClick={() => toggleMarker(m)}
                aria-pressed={markers.includes(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('room:token.assignedPlayerLabel')}</span>
          <select
            className={styles.input}
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            aria-label={t('room:token.assignedPlayerLabel')}
          >
            <option value="">{t('room:token.noAssigned')}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name} ({m.role})</option>
            ))}
          </select>
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={saving}
          >
            {t('common:btn.cancel')}
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? t('common:btn.saving') : t('common:btn.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

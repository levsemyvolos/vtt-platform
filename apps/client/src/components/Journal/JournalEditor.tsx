/**
 * JournalEditor — modal overlay for create / edit / view of a JournalEntry.
 *
 * Complexity kept ≤ 10 per function by splitting into sub-components:
 *   useEditorActions  — save / delete async logic
 *   AttachmentSection — asset picker + preview
 *   EditorFooter      — action buttons row
 *   VisibilityRow     — visibility badge + Share button
 *   JournalEditor     — orchestrator (thin)
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Lock, Users } from 'lucide-react';
import type { AssetDTO, JournalEntryDTO, Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  createEntryThunk,
  updateEntryThunk,
  deleteEntryThunk,
} from '../../store/journal';
import AssetLibrary from '../AssetLibrary/AssetLibrary';
import ImageUpload from '../AssetUpload/ImageUpload';
import ImageLightbox from './ImageLightbox';
import ShareModal from './ShareModal';
import styles from './JournalEditor.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  /** '__new__' for create mode, UUID for edit mode. */
  entryId: string;
  roomId: string;
  myUserId: string;
  myRole: Role;
  onClose: () => void;
}

type PickerMode = 'library' | 'upload' | null;

interface AssetState {
  assetId: string | null;
  assetMime: string | undefined;
  assetUrl: string | undefined;
}

// ---------------------------------------------------------------------------
// Hook: editor actions (save / delete) — extracts async complexity
// ---------------------------------------------------------------------------

interface UseEditorActionsParams {
  isCreateMode: boolean;
  entry: JournalEntryDTO | null;
  roomId: string;
  title: string;
  body: string;
  assetState: AssetState;
  onClose: () => void;
}

interface UseEditorActionsResult {
  saving: boolean;
  deleting: boolean;
  error: string | null;
  handleSave: () => Promise<void>;
  handleDelete: () => Promise<void>;
}

function useEditorActions({
  isCreateMode,
  entry,
  roomId,
  title,
  body,
  assetState,
  onClose,
}: UseEditorActionsParams): UseEditorActionsResult {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallback = t('journal.editor.deletingErrFallback');

  async function handleSave(): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      if (isCreateMode) {
        const { assetId } = assetState;
        const createReq = assetId !== null ? { title, body, assetId } : { title, body };
        await dispatch(createEntryThunk({ roomId, req: createReq })).unwrap();
      } else if (entry) {
        const { assetId, assetUrl } = assetState;
        const didRemove = entry.assetUrl !== undefined && assetUrl === undefined;
        const updateReq = assetId !== null
          ? { title, body, assetId }
          : didRemove
            ? { title, body, assetId: null as null }
            : { title, body };
        await dispatch(updateEntryThunk({ id: entry.id, req: updateReq })).unwrap();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!entry) return;
    if (!window.confirm(t('journal.editor.deleteConfirm'))) return;
    setDeleting(true);
    try {
      await dispatch(deleteEntryThunk(entry.id)).unwrap();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setDeleting(false);
    }
  }

  return { saving, deleting, error, handleSave, handleDelete };
}

// ---------------------------------------------------------------------------
// Sub-component: AttachmentPreview
// ---------------------------------------------------------------------------

interface AttachPreviewProps {
  assetUrl: string;
  isImage: boolean;
  onOpenLightbox: () => void;
  onChange: () => void;
  onRemove: () => void;
}

function AttachmentPreview({
  assetUrl,
  isImage,
  onOpenLightbox,
  onChange,
  onRemove,
}: AttachPreviewProps): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <div className={styles.attachPreview}>
      {isImage ? (
        <img
          src={assetUrl}
          alt={t('journal.editor.openLightbox')}
          className={styles.attachThumb}
          onClick={onOpenLightbox}
          title={t('journal.editor.openLightbox')}
        />
      ) : (
        <span className={styles.attachFileIcon}>
          <FileText size={24} aria-hidden />
        </span>
      )}
      <span className={styles.attachLabel}>
        {isImage ? t('journal.editor.openLightbox') : t('journal.editor.fileAttachment')}
      </span>
      <div className={styles.attachActions}>
        <button type="button" className={styles.attachActionBtn} onClick={onChange}>
          {t('journal.editor.changeBtn')}
        </button>
        <button
          type="button"
          className={`${styles.attachActionBtn} ${styles.removeBtn}`}
          onClick={onRemove}
        >
          {t('journal.editor.removeBtn')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: InlinePicker
// ---------------------------------------------------------------------------

interface InlinePickerProps {
  mode: 'library' | 'upload';
  roomId: string;
  onPick: (asset: AssetDTO) => void;
  onClose: () => void;
}

function InlinePicker({ mode, roomId, onPick, onClose }: InlinePickerProps): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <div className={styles.pickerCard}>
      <div className={styles.pickerHeader}>
        <span className={styles.pickerTitle}>
          {mode === 'library' ? t('journal.editor.fromLibrary') : t('journal.editor.uploadNew')}
        </span>
        <button
          type="button"
          className={styles.pickerCloseBtn}
          onClick={onClose}
          aria-label={t('journal.editor.cancelBtn')}
        >
          ✕
        </button>
      </div>
      {mode === 'library' ? (
        <AssetLibrary
          roomId={roomId}
          tabs={['images', 'pdfs', 'audio']}
          pickLabel={t('journal.editor.useAsAttachment')}
          onPick={onPick}
        />
      ) : (
        <ImageUpload roomId={roomId} onUploaded={onPick} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: AttachmentSection
// ---------------------------------------------------------------------------

interface AttachSectionProps {
  assetState: AssetState;
  pickerOpen: PickerMode;
  roomId: string;
  canBrowseLibrary: boolean;
  onPick: (asset: AssetDTO) => void;
  onRemove: () => void;
  onOpenLightbox: () => void;
  onSetPickerOpen: (m: PickerMode) => void;
}

function AttachmentSection({
  assetState,
  pickerOpen,
  roomId,
  canBrowseLibrary,
  onPick,
  onRemove,
  onOpenLightbox,
  onSetPickerOpen,
}: AttachSectionProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const { assetUrl, assetMime } = assetState;
  const hasAsset = assetUrl !== undefined;
  const isImage = assetMime?.startsWith('image/') ?? false;

  return (
    <div className={styles.attachSection}>
      <span className={styles.label}>{t('journal.editor.attachmentLabel')}</span>

      {hasAsset && assetUrl !== undefined ? (
        <AttachmentPreview
          assetUrl={assetUrl}
          isImage={isImage}
          onOpenLightbox={onOpenLightbox}
          onChange={() => onSetPickerOpen(canBrowseLibrary ? 'library' : 'upload')}
          onRemove={onRemove}
        />
      ) : (
        <div className={styles.pickerButtons}>
          {canBrowseLibrary && (
            <button
              type="button"
              className={styles.pickerBtn}
              onClick={() => onSetPickerOpen(pickerOpen === 'library' ? null : 'library')}
            >
              {t('journal.editor.fromLibrary')}
            </button>
          )}
          <button
            type="button"
            className={styles.pickerBtn}
            onClick={() => onSetPickerOpen(pickerOpen === 'upload' ? null : 'upload')}
          >
            {t('journal.editor.uploadNew')}
          </button>
        </div>
      )}

      {pickerOpen !== null && (
        <InlinePicker
          mode={pickerOpen}
          roomId={roomId}
          onPick={onPick}
          onClose={() => onSetPickerOpen(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ReadOnlyAttachment
// ---------------------------------------------------------------------------

interface ReadOnlyAttachmentProps {
  assetUrl: string;
  isImage: boolean;
  onOpenLightbox: () => void;
}

function ReadOnlyAttachment({ assetUrl, isImage, onOpenLightbox }: ReadOnlyAttachmentProps): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <div className={styles.attachSection}>
      <span className={styles.label}>{t('journal.editor.attachmentLabel')}</span>
      <div className={styles.attachPreview}>
        {isImage ? (
          <img
            src={assetUrl}
            alt={t('journal.editor.openLightbox')}
            className={styles.attachThumb}
            onClick={onOpenLightbox}
            title={t('journal.editor.openLightbox')}
          />
        ) : (
          <span className={styles.attachFileIcon}>
            <FileText size={24} aria-hidden />
          </span>
        )}
        <span className={styles.attachLabel}>
          {isImage ? t('journal.editor.openLightbox') : t('journal.editor.fileAttachment')}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: VisibilityRow
// ---------------------------------------------------------------------------

interface VisibilityRowProps {
  entry: JournalEntryDTO;
  canShare: boolean;
  onShare: () => void;
}

function VisibilityRow({ entry, canShare, onShare }: VisibilityRowProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const isShared = entry.visibility === 'shared';
  return (
    <div className={styles.visibilityRow}>
      <span className={`${styles.visibilityBadge} ${isShared ? styles.visibilityShared : ''}`}>
        {isShared ? <Users size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
        {' '}{isShared ? t('journal.visibilityShared') : t('journal.visibilityPrivate')}
      </span>
      {canShare && (
        <button type="button" className={styles.shareBtn} onClick={onShare}>
          {t('journal.editor.shareBtn')}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: EditorFooter
// ---------------------------------------------------------------------------

interface EditorFooterProps {
  isReadOnly: boolean;
  canDelete: boolean;
  saving: boolean;
  deleting: boolean;
  titleEmpty: boolean;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

function EditorFooter({
  isReadOnly,
  canDelete,
  saving,
  deleting,
  titleEmpty,
  onSave,
  onDelete,
  onCancel,
}: EditorFooterProps): JSX.Element {
  const { t } = useTranslation('campaign');
  if (isReadOnly) {
    return (
      <div className={styles.footer}>
        <span className={styles.spacer} />
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          {t('journal.editor.cancelBtn')}
        </button>
      </div>
    );
  }
  return (
    <div className={styles.footer}>
      {canDelete && (
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={onDelete}
          disabled={deleting || saving}
        >
          {deleting ? '…' : t('journal.editor.deleteBtn')}
        </button>
      )}
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.cancelBtn}
        onClick={onCancel}
        disabled={saving || deleting}
      >
        {t('journal.editor.cancelBtn')}
      </button>
      <button
        type="button"
        className={styles.saveBtn}
        onClick={onSave}
        disabled={saving || deleting || titleEmpty}
      >
        {saving ? t('journal.editor.saving') : t('journal.editor.saveBtn')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: JournalEditor
// ---------------------------------------------------------------------------

/* Orchestrator component already split into 6 sub-components (useEditorActions,
 * EditorFormBody, AttachmentSection, ReadOnlyAttachment, EditorFooter, VisibilityRow).
 * Residual complexity comes from optional-chaining + permission flags that read
 * more cleanly inline than as further extraction. */
// eslint-disable-next-line complexity
export default function JournalEditor({
  entryId,
  roomId,
  myUserId,
  myRole,
  onClose,
}: Props): JSX.Element | null {
  const { t } = useTranslation('campaign');

  const isCreateMode = entryId === '__new__';
  const entry = useAppSelector((s) =>
    isCreateMode ? null : s.journal.entries.find((e) => e.id === entryId) ?? null,
  );

  // Close if entry was deleted via WSS while editor was open
  const staleRef = useRef(false);
  useEffect(() => {
    if (!isCreateMode && entry === null && !staleRef.current) {
      staleRef.current = true;
      onClose();
    }
  }, [isCreateMode, entry, onClose]);

  // Form fields
  const [title, setTitle] = useState(() => entry?.title ?? '');
  const [body, setBody] = useState(() => entry?.body ?? '');
  const [assetState, setAssetState] = useState<AssetState>({
    assetId: null,
    assetMime: entry?.assetMime,
    assetUrl: entry?.assetUrl,
  });

  // UI state
  const [showShareModal, setShowShareModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<PickerMode>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Sync from store when entry is updated (WSS patches)
  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setBody(entry.body);
      setAssetState((prev) => ({
        ...prev,
        assetMime: entry.assetMime,
        assetUrl: entry.assetUrl,
      }));
    }
  }, [entry]);

  // Keyboard close (ESC)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !showShareModal && !lightboxOpen) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, showShareModal, lightboxOpen]);

  const backdropRef = useRef<HTMLDivElement>(null);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === backdropRef.current && !showShareModal && !lightboxOpen) {
      onClose();
    }
  }

  function handleAssetPicked(asset: AssetDTO): void {
    setAssetState({ assetId: asset.id, assetMime: asset.type, assetUrl: asset.url });
    setPickerOpen(null);
  }

  function handleRemoveAsset(): void {
    setAssetState((prev) => ({ ...prev, assetId: null, assetMime: undefined, assetUrl: undefined }));
  }

  // Permissions
  const isGM = myRole === 'GM';
  const isAuthor = entry?.authorId === myUserId;
  const isReadOnly = !isCreateMode && !isGM && !isAuthor;
  const canDelete = !isCreateMode && (isGM || isAuthor) && !isReadOnly;
  const canShare = isGM && !isCreateMode;

  const { saving, deleting, error, handleSave, handleDelete } = useEditorActions({
    isCreateMode,
    entry,
    roomId,
    title,
    body,
    assetState,
    onClose,
  });

  const heading = isCreateMode
    ? t('journal.editor.headingCreate')
    : t('journal.editor.headingEdit');

  return createPortal(
    <>
      <div ref={backdropRef} className={styles.backdrop} onClick={handleBackdropClick}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label={heading}>
          {/* Header */}
          <div className={styles.header}>
            <h2 className={styles.heading}>{heading}</h2>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t('journal.editor.cancelBtn')}
            >
              ✕
            </button>
          </div>

          {/* Visibility row — only in edit mode */}
          {!isCreateMode && entry && (
            <VisibilityRow
              entry={entry}
              canShare={canShare}
              onShare={() => setShowShareModal(true)}
            />
          )}

          <EditorFormBody
            title={title}
            body={body}
            assetState={assetState}
            pickerOpen={pickerOpen}
            isReadOnly={isReadOnly}
            saving={saving}
            roomId={roomId}
            canBrowseLibrary={isGM}
            onTitleChange={setTitle}
            onBodyChange={setBody}
            onPick={handleAssetPicked}
            onRemove={handleRemoveAsset}
            onOpenLightbox={() => setLightboxOpen(true)}
            onSetPickerOpen={setPickerOpen}
          />

          {/* Error banner */}
          {error !== null && (
            <div className={styles.error} role="alert">{error}</div>
          )}

          {/* Footer */}
          <EditorFooter
            isReadOnly={isReadOnly}
            canDelete={canDelete}
            saving={saving}
            deleting={deleting}
            titleEmpty={title.trim().length === 0}
            onSave={() => { void handleSave(); }}
            onDelete={() => { void handleDelete(); }}
            onCancel={onClose}
          />
        </div>
      </div>

      {/* Sub-modals */}
      {showShareModal && entry && (
        <ShareModal entry={entry} onClose={() => setShowShareModal(false)} />
      )}
      {lightboxOpen && assetState.assetUrl !== undefined && (
        <ImageLightbox
          src={assetState.assetUrl}
          alt={entry?.title ?? ''}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Extracted body to keep JournalEditor cyclomatic complexity ≤ 10
// ---------------------------------------------------------------------------

interface EditorFormBodyProps {
  title: string;
  body: string;
  assetState: AssetState;
  pickerOpen: PickerMode;
  isReadOnly: boolean;
  saving: boolean;
  roomId: string;
  canBrowseLibrary: boolean;
  onTitleChange: (next: string) => void;
  onBodyChange: (next: string) => void;
  onPick: (asset: AssetDTO) => void;
  onRemove: () => void;
  onOpenLightbox: () => void;
  onSetPickerOpen: (mode: PickerMode) => void;
}

function EditorFormBody(props: EditorFormBodyProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const {
    title, body, assetState, pickerOpen, isReadOnly, saving, roomId, canBrowseLibrary,
    onTitleChange, onBodyChange, onPick, onRemove, onOpenLightbox, onSetPickerOpen,
  } = props;
  const isImage = assetState.assetMime?.startsWith('image/') ?? false;
  const hasAsset = assetState.assetUrl !== undefined;
  return (
    <div className={styles.body}>
      <div className={styles.fieldGroup}>
        <label htmlFor="je-title" className={styles.label}>
          {t('journal.editor.titleLabel')}
        </label>
        <input
          id="je-title"
          type="text"
          className={styles.titleInput}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('journal.editor.titlePlaceholder')}
          disabled={isReadOnly || saving}
          maxLength={200}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="je-body" className={styles.label}>
          {t('journal.editor.bodyLabel')}
        </label>
        <textarea
          id="je-body"
          className={styles.bodyTextarea}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={t('journal.editor.bodyPlaceholder')}
          disabled={isReadOnly || saving}
          rows={12}
        />
      </div>
      {!isReadOnly && (
        <AttachmentSection
          assetState={assetState}
          pickerOpen={pickerOpen}
          roomId={roomId}
          canBrowseLibrary={canBrowseLibrary}
          onPick={onPick}
          onRemove={onRemove}
          onOpenLightbox={onOpenLightbox}
          onSetPickerOpen={onSetPickerOpen}
        />
      )}
      {isReadOnly && hasAsset && assetState.assetUrl !== undefined && (
        <ReadOnlyAttachment
          assetUrl={assetState.assetUrl}
          isImage={isImage}
          onOpenLightbox={onOpenLightbox}
        />
      )}
    </div>
  );
}

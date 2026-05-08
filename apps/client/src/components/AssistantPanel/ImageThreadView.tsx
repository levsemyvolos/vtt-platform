import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import type { AssetDTO, AssistantImageTurnDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchImageTurns, continueImageConv } from '../../store/imageAssistant';
import { uploadImageAsset } from '../../api/assets';
import { ApiError } from '../../api/apiFetch';
import styles from './ImageThreadView.module.css';

interface ImageThreadViewProps {
  roomId: string;
}

const MAX_REFERENCES = 3;

// ─── Sub-components ─────────────────────────────────────────────────────────

interface TurnCardProps {
  turn: AssistantImageTurnDTO;
  referenceAlt: string;
  generatedAlt: string;
}

function TurnCard({ turn, referenceAlt, generatedAlt }: TurnCardProps): JSX.Element {
  return (
    <article className={styles.turnCard}>
      <header className={styles.turnHeader}>
        <span className={styles.turnIndex}>v{turn.turnIndex + 1}</span>
        <p className={styles.turnPrompt} title={turn.userPrompt}>
          {turn.userPrompt}
        </p>
      </header>
      {turn.referenceAssetUrls.length > 0 && (
        <div className={styles.turnRefs}>
          {turn.referenceAssetUrls.map((url, i) => (
            <img
              key={turn.referenceAssetIds[i] ?? url}
              src={url}
              alt={referenceAlt}
              className={styles.turnRefThumb}
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            />
          ))}
        </div>
      )}
      {turn.generatedAssetUrl && (
        <img
          src={turn.generatedAssetUrl}
          alt={generatedAlt}
          className={styles.turnImg}
          onClick={() =>
            turn.generatedAssetUrl &&
            window.open(turn.generatedAssetUrl, '_blank', 'noopener,noreferrer')
          }
        />
      )}
    </article>
  );
}

interface RefsRowProps {
  references: AssetDTO[];
  uploading: boolean;
  isGenerating: boolean;
  onRemove: (idx: number) => void;
  onAddClick: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  addReferenceLabel: string;
  uploadingLabel: string;
  removeReferenceLabel: string;
}

function RefsRow({
  references,
  uploading,
  isGenerating,
  onRemove,
  onAddClick,
  fileInputRef,
  onFileChange,
  addReferenceLabel,
  uploadingLabel,
  removeReferenceLabel,
}: RefsRowProps): JSX.Element {
  return (
    <div className={styles.refsRow}>
      {references.map((r, i) => (
        <div key={r.id} className={styles.refChip}>
          <img src={r.url} alt={r.name} className={styles.refChipImg} />
          <button
            type="button"
            className={styles.refRemove}
            aria-label={removeReferenceLabel}
            onClick={() => onRemove(i)}
          >
            ×
          </button>
        </div>
      ))}
      {references.length < MAX_REFERENCES && (
        <button
          type="button"
          className={styles.addRefBtn}
          onClick={onAddClick}
          disabled={uploading || isGenerating}
        >
          {uploading ? uploadingLabel : addReferenceLabel}
        </button>
      )}
      <input
        ref={fileInputRef as RefObject<HTMLInputElement>}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className={styles.fileInputHidden}
        onChange={onFileChange}
      />
    </div>
  );
}

interface PromptBarProps {
  prompt: string;
  references: AssetDTO[];
  uploading: boolean;
  uploadError: string | null;
  isGenerating: boolean;
  hasActiveConv: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPromptChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onRemoveRef: (idx: number) => void;
  onAddRefClick: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  labels: {
    placeholder: string;
    hint: string;
    submit: string;
    generating: string;
    addReference: string;
    uploading: string;
    removeReference: string;
  };
}

function PromptBar({
  prompt,
  references,
  uploading,
  uploadError,
  isGenerating,
  hasActiveConv,
  fileInputRef,
  onPromptChange,
  onKeyDown,
  onSubmit,
  onRemoveRef,
  onAddRefClick,
  onFileChange,
  labels,
}: PromptBarProps): JSX.Element {
  return (
    <div className={styles.promptBar}>
      <RefsRow
        references={references}
        uploading={uploading}
        isGenerating={isGenerating}
        onRemove={onRemoveRef}
        onAddClick={onAddRefClick}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        addReferenceLabel={labels.addReference}
        uploadingLabel={labels.uploading}
        removeReferenceLabel={labels.removeReference}
      />
      {uploadError && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <p className={styles.uploadErrorBar} role="alert">{i18next.t(uploadError as any)}</p>
      )}
      <textarea
        className={styles.textarea}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={labels.placeholder}
        rows={3}
        disabled={isGenerating}
        aria-label={labels.placeholder}
      />
      <div className={styles.actions}>
        <span className={styles.hint}>{labels.hint}</span>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={onSubmit}
          disabled={isGenerating || !prompt.trim() || !hasActiveConv}
        >
          {isGenerating ? labels.generating : labels.submit}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ImageThreadView({ roomId }: ImageThreadViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('assistant');
  const activeConvId = useAppSelector((s) => s.imageAssistant.activeConversationId);
  const status = useAppSelector((s) => s.imageAssistant.status);
  const generatingConvId = useAppSelector((s) => s.imageAssistant.generatingConversationId);
  const error = useAppSelector((s) => s.imageAssistant.error);
  /** Pending only when this exact thread is the one being generated for. */
  const isThisGenerating = status === 'generating' && generatingConvId === activeConvId;
  const turns = useAppSelector((s) =>
    activeConvId ? (s.imageAssistant.turns[activeConvId] ?? []) : [],
  );
  const turnsLoaded = useAppSelector((s) =>
    activeConvId ? Boolean(s.imageAssistant.turnsLoaded[activeConvId]) : false,
  );

  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<AssetDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ladderEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch turns when conversation changes.
  useEffect(() => {
    if (activeConvId && !turnsLoaded) {
      void dispatch(fetchImageTurns({ conversationId: activeConvId }));
    }
  }, [dispatch, activeConvId, turnsLoaded]);

  // Auto-scroll to bottom when new turn appears.
  useEffect(() => {
    ladderEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, status]);

  // Reset reference + prompt when switching conversations.
  useEffect(() => {
    setPrompt('');
    setReferences([]);
    setUploadError(null);
  }, [activeConvId]);

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    if (references.length >= MAX_REFERENCES) return;
    setUploading(true);
    setUploadError(null);
    try {
      const asset = await uploadImageAsset(roomId, file);
      setReferences((prev) => [...prev, asset]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'errors:network.uploadFailed');
    } finally {
      setUploading(false);
      // Reset input so the same file can be picked again later.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeReference(idx: number): void {
    setReferences((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(): void {
    if (!activeConvId) return;
    const trimmed = prompt.trim();
    if (!trimmed || status === 'generating') return;
    void dispatch(
      continueImageConv({
        conversationId: activeConvId,
        prompt: trimmed,
        referenceAssetIds: references.map((r) => r.id),
      }),
    );
    setPrompt('');
    setReferences([]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  if (!activeConvId) {
    return (
      <div className={styles.viewport}>
        <p className={styles.emptyState}>{t('imageThread.noConversation')}</p>
      </div>
    );
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.ladder}>
        {turns.length === 0 && !isThisGenerating && (
          <p className={styles.emptyState}>{t('imageThread.empty')}</p>
        )}
        {turns.map((turn) => (
          <TurnCard
            key={turn.id}
            turn={turn}
            referenceAlt={t('imageThread.referenceAlt')}
            generatedAlt={t('imageThread.generatedAlt')}
          />
        ))}
        {isThisGenerating && (
          <article className={styles.turnCard}>
            <header className={styles.turnHeader}>
              <span className={styles.turnIndex}>v{turns.length + 1}</span>
              <p className={styles.turnPrompt}>{t('imageThread.generating')}</p>
            </header>
            <div className={styles.spinner} aria-label={t('imageThread.generating')}>
              ⏳
            </div>
          </article>
        )}
        <div ref={ladderEndRef} />
      </div>
      {error && status === 'error' && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <p className={styles.errorBar} role="alert">{i18next.t(error as any)}</p>
      )}
      <PromptBar
        prompt={prompt}
        references={references}
        uploading={uploading}
        uploadError={uploadError}
        isGenerating={status === 'generating'}
        hasActiveConv={Boolean(activeConvId)}
        fileInputRef={fileInputRef}
        onPromptChange={setPrompt}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        onRemoveRef={removeReference}
        onAddRefClick={() => fileInputRef.current?.click()}
        onFileChange={(e) => void handleFileSelected(e)}
        labels={{
          placeholder: t('imageThread.placeholder'),
          hint: t('imageThread.hint'),
          submit: t('imageThread.submit'),
          generating: t('imageThread.generating'),
          addReference: t('imageThread.addReference'),
          uploading: t('imageThread.uploading'),
          removeReference: t('imageThread.removeReference'),
        }}
      />
    </div>
  );
}

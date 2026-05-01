import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIImageRequest, AIImageResponse, UpdateSceneRequest } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';
import styles from './GenerateBackgroundModal.module.css';

const STYLE_PRESET_KEYS = ['realistic', 'fantasy', 'sci-fi', 'cartoon'] as const;
type StylePreset = (typeof STYLE_PRESET_KEYS)[number];

interface GenerateBackgroundModalProps {
  roomId: string;
  sceneId: string;
  onClose: () => void;
}

export default function GenerateBackgroundModal({
  roomId,
  sceneId,
  onClose,
}: GenerateBackgroundModalProps): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<StylePreset>('fantasy');
  const [preview, setPreview] = useState<AIImageResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setPreview(null);
    try {
      const body: AIImageRequest = { prompt: prompt.trim(), roomId, style };
      const result = await apiFetch<AIImageResponse>('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPreview(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t('errors:api.rateLimitExceeded'));
      } else {
        setError(err instanceof Error ? err.message : t('errors:network.generateFailed'));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleUseAsBackground(): Promise<void> {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const patch: UpdateSceneRequest = { backgroundAssetId: preview.assetId };
      await apiFetch(`/api/scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.applyFailed'));
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t('room:aiGenerate.dialogLabel')} className={styles.backdrop}>
      <div className={styles.dialog}>
        <h2>{t('room:aiGenerate.heading')}</h2>

        <form onSubmit={(e) => void handleGenerate(e)} aria-label={t('room:aiGenerate.formLabel')} noValidate>
          <div className={styles.field}>
            <label htmlFor="ai-prompt">{t('room:aiGenerate.promptLabel')}</label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={t('room:aiGenerate.promptPlaceholder')}
              maxLength={400}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="ai-style">{t('room:aiGenerate.styleLabel')}</label>
            <select
              id="ai-style"
              value={style}
              onChange={(e) => setStyle(e.target.value as StylePreset)}
            >
              {STYLE_PRESET_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`room:aiGenerate.styles.${key}`)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={generating || applying}>
              {t('common:btn.cancel')}
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={generating || !prompt.trim()}>
              {generating ? t('room:aiGenerate.generating') : t('room:aiGenerate.generateBtn')}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {preview && (
          <div className={styles.preview}>
            <img
              src={preview.previewUrl}
              alt={t('room:aiGenerate.previewAlt')}
              className={styles.previewImg}
            />
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => void handleUseAsBackground()}
                disabled={applying}
                className={styles.btnSubmit}
              >
                {applying ? t('room:aiGenerate.applying') : t('room:aiGenerate.applyBg')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

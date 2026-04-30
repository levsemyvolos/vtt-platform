import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIImageRequest, AIImageResponse, UpdateSceneRequest } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';

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

  return (
    <div role="dialog" aria-modal="true" aria-label={t('room:aiGenerate.dialogLabel')} className="modal-backdrop">
      <div className="modal modal--wide">
        <h2>{t('room:aiGenerate.heading')}</h2>

        <form onSubmit={(e) => void handleGenerate(e)} aria-label={t('room:aiGenerate.formLabel')} noValidate>
          <div className="field">
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

          <div className="field">
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

          <div className="modal__actions">
            <button type="button" onClick={onClose} disabled={generating || applying}>
              {t('common:btn.cancel')}
            </button>
            <button type="submit" disabled={generating || !prompt.trim()}>
              {generating ? t('room:aiGenerate.generating') : t('room:aiGenerate.generateBtn')}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="modal__error">
            {error}
          </p>
        )}

        {preview && (
          <div className="ai-preview">
            <img
              src={preview.previewUrl}
              alt={t('room:aiGenerate.previewAlt')}
              className="ai-preview__img"
            />
            <div className="modal__actions">
              <button
                type="button"
                onClick={() => void handleUseAsBackground()}
                disabled={applying}
                className="btn-primary"
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

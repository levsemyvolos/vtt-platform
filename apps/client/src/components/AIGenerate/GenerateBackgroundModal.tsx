import { useState, type FormEvent } from 'react';
import type { AIImageRequest, AIImageResponse, UpdateSceneRequest } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';

const STYLE_PRESETS = [
  { value: 'realistic', label: 'Реалістичний' },
  { value: 'fantasy', label: 'Фентезі' },
  { value: 'sci-fi', label: 'Sci-Fi' },
  { value: 'cartoon', label: 'Мультяшний' },
] as const;

type StylePreset = (typeof STYLE_PRESETS)[number]['value'];

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
        setError('Ліміт AI-запитів вичерпано. Спробуйте через хвилину.');
      } else {
        setError(err instanceof Error ? err.message : 'Помилка генерації');
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
      setError(err instanceof Error ? err.message : 'Не вдалося застосувати фон');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Генерація фону" className="modal-backdrop">
      <div className="modal modal--wide">
        <h2>Згенерувати фон сцени (AI)</h2>

        <form onSubmit={(e) => void handleGenerate(e)} aria-label="форма генерації фону" noValidate>
          <div className="field">
            <label htmlFor="ai-prompt">Опис сцени</label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Підземелля з кам'яними стінами та смолоскипами..."
              maxLength={400}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="ai-style">Стиль</label>
            <select
              id="ai-style"
              value={style}
              onChange={(e) => setStyle(e.target.value as StylePreset)}
            >
              {STYLE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="modal__actions">
            <button type="button" onClick={onClose} disabled={generating || applying}>
              Скасувати
            </button>
            <button type="submit" disabled={generating || !prompt.trim()}>
              {generating ? 'Генерація…' : 'Згенерувати'}
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
              alt="Згенерований фон"
              className="ai-preview__img"
            />
            <div className="modal__actions">
              <button
                type="button"
                onClick={() => void handleUseAsBackground()}
                disabled={applying}
                className="btn-primary"
              >
                {applying ? 'Застосування…' : 'Використати як фон'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

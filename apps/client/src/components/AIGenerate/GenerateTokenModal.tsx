import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIImageRequest, AIImageResponse } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';
import GenerationProgress from './GenerationProgress';
import PromptAssistModal from './PromptAssistModal';
import paStyles from './PromptAssistModal.module.css';
import styles from './GenerateBackgroundModal.module.css';

// P2.2 — token style keys mirror GenerateBackgroundModal / GeminiProvider.TOKEN_STYLE_MAP.
const TOKEN_STYLE_KEYS = ['fantasy', 'realistic', 'sci-fi', 'cartoon', 'dark-fantasy', 'watercolor'] as const;
type TokenStyleKey = (typeof TOKEN_STYLE_KEYS)[number];

type TokenFraming = 'full-body' | 'half-body' | 'bust';
const TOKEN_FRAMING_KEYS: TokenFraming[] = ['full-body', 'half-body', 'bust'];

function mapTokenError(err: unknown, rateLimitMsg: string, safetyMsg: string, fallbackMsg: string): string {
  if (err instanceof ApiError && err.status === 429) return rateLimitMsg;
  if (err instanceof ApiError && err.kind === 'ai_safety') return safetyMsg;
  return err instanceof Error ? err.message : fallbackMsg;
}

interface Props {
  roomId: string;
  onGenerated: (assetId: string, previewUrl: string) => void;
  onClose: () => void;
}

export default function GenerateTokenModal({ roomId, onGenerated, onClose }: Props): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);

  const [subject, setSubject]     = useState('');
  const [style, setStyle]         = useState<TokenStyleKey>('fantasy');
  const [framing, setFraming]     = useState<TokenFraming>('full-body');
  const [preview, setPreview]     = useState<AIImageResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);

  async function handleGenerate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!subject.trim()) return;
    setGenerating(true);
    setError(null);
    setPreview(null);
    try {
      const body: AIImageRequest = { prompt: subject.trim(), roomId, style, tokenFraming: framing };
      const result = await apiFetch<AIImageResponse>('/api/ai/image/token', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPreview(result);
    } catch (err) {
      setError(mapTokenError(err, t('errors:api.rateLimitExceeded'), t('errors:ai.safety'), t('errors:network.generateFailed')));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t('room:aiToken.dialogLabel')} className={styles.backdrop}>
      <div className={styles.dialog}>
        <h2>{t('room:aiToken.heading')}</h2>

        <form onSubmit={(e) => void handleGenerate(e)} aria-label={t('room:aiToken.formLabel')} noValidate>

          <div className={styles.field}>
            <label htmlFor="token-subject">{t('room:aiToken.subjectLabel')}</label>
            <textarea
              id="token-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows={3}
              placeholder={t('room:aiToken.subjectPlaceholder')}
              maxLength={280}
              autoFocus
            />
            <button
              type="button"
              className={paStyles.assistTrigger}
              onClick={() => setAssistOpen(true)}
              disabled={generating}
            >
              {t('room:promptAssist.openBtn')}
            </button>
          </div>

          <div className={styles.field}>
            <label htmlFor="token-style">{t('room:aiToken.styleLabel')}</label>
            <select id="token-style" value={style} onChange={(e) => setStyle(e.target.value as TokenStyleKey)}>
              {TOKEN_STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{t(`room:aiGenerate.styles.${k}`)}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="token-framing">{t('room:aiToken.framingLabel')}</label>
            <select id="token-framing" value={framing} onChange={(e) => setFraming(e.target.value as TokenFraming)}>
              {TOKEN_FRAMING_KEYS.map((k) => (
                <option key={k} value={k}>{t(`room:aiToken.framing.${k}`)}</option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={generating}>
              {t('common:btn.cancel')}
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={generating || !subject.trim()}>
              {generating ? t('room:aiToken.generating') : t('room:aiToken.generateBtn')}
            </button>
          </div>
        </form>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <GenerationProgress active={generating} />

        {assistOpen && (
          <PromptAssistModal
            roomId={roomId}
            target="image"
            i18nNamespace="room"
            onApply={(draft) => setSubject(draft)}
            onClose={() => setAssistOpen(false)}
          />
        )}

        {preview && (
          <div className={styles.preview}>
            <img
              src={preview.previewUrl}
              alt={t('room:aiToken.previewAlt')}
              className={styles.previewImg}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnSubmit}
                onClick={() => { onGenerated(preview.assetId, preview.previewUrl); onClose(); }}
              >
                {t('room:aiToken.useAsToken')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

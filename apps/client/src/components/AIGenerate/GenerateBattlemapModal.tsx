import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIImageRequest, AIImageResponse, UpdateSceneRequest } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';
import GenerationProgress from './GenerationProgress';
import styles from './GenerateBackgroundModal.module.css';

// P2.3 — battlemap style keys mirror GeminiProvider.BATTLEMAP_STYLE_MAP (server-side).
const BATTLEMAP_STYLE_KEYS = ['fantasy', 'realistic', 'sci-fi', 'cartoon', 'dark-fantasy', 'watercolor'] as const;
type BattlemapStyleKey = (typeof BATTLEMAP_STYLE_KEYS)[number];

function mapBattlemapError(err: unknown, rateLimitMsg: string, safetyMsg: string, fallbackMsg: string): string {
  if (err instanceof ApiError && err.status === 429) return rateLimitMsg;
  if (err instanceof ApiError && err.kind === 'ai_safety') return safetyMsg;
  return err instanceof Error ? err.message : fallbackMsg;
}

function mapApplyError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface Props {
  roomId: string;
  sceneId: string;
  onClose: () => void;
}

export default function GenerateBattlemapModal({ roomId, sceneId, onClose }: Props): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);

  const [location, setLocation]       = useState('');
  const [environment, setEnvironment] = useState('');
  const [style, setStyle]             = useState<BattlemapStyleKey>('fantasy');
  const [generated, setGenerated]     = useState<AIImageResponse | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [applying, setApplying]       = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleGenerate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!location.trim()) return;
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const body: AIImageRequest = {
        prompt: location.trim(),
        roomId,
        style,
        ...(environment ? { locationDetails: environment } : {}),
      };
      const result = await apiFetch<AIImageResponse>('/api/ai/image/battlemap', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setGenerated(result);
    } catch (err) {
      setError(mapBattlemapError(err, t('errors:api.rateLimitExceeded'), t('errors:ai.safety'), t('errors:network.generateFailed')));
    } finally {
      setGenerating(false);
    }
  }

  async function handleUseAsBackground(): Promise<void> {
    if (!generated) return;
    setApplying(true);
    setError(null);
    try {
      const patch: UpdateSceneRequest = { backgroundAssetId: generated.assetId };
      await apiFetch(`/api/scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onClose();
    } catch (err) {
      setError(mapApplyError(err, t('errors:network.applyFailed')));
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
    <div role="dialog" aria-modal="true" aria-label={t('room:aiBattlemap.dialogLabel')} className={styles.backdrop}>
      <div className={styles.dialog}>
        <h2>{t('room:aiBattlemap.heading')}</h2>

        <form onSubmit={(e) => void handleGenerate(e)} aria-label={t('room:aiBattlemap.formLabel')} noValidate>

          {/* Location / area type (required) */}
          <div className={styles.field}>
            <label htmlFor="bm-location">{t('room:aiBattlemap.locationLabel')}</label>
            <textarea
              id="bm-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              rows={3}
              placeholder={t('room:aiBattlemap.locationPlaceholder')}
              maxLength={280}
              autoFocus
            />
            <small className={styles.fieldHint}>{t('room:aiGenerate.englishHint')}</small>
          </div>

          {/* Environment preset (optional) */}
          <div className={styles.field}>
            <label htmlFor="bm-environment">{t('room:aiBattlemap.environmentLabel')}</label>
            <select
              id="bm-environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="">{t('room:aiBattlemap.environmentNone')}</option>
              {(t('room:aiBattlemap.environmentPresets', { returnObjects: true }) as string[]).map((label, i) => (
                <option key={i} value={label}>{label}</option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div className={styles.field}>
            <label htmlFor="bm-style">{t('room:aiBattlemap.styleLabel')}</label>
            <select
              id="bm-style"
              value={style}
              onChange={(e) => setStyle(e.target.value as BattlemapStyleKey)}
            >
              {BATTLEMAP_STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{t(`room:aiGenerate.styles.${k}`)}</option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={generating || applying}
            >
              {t('common:btn.cancel')}
            </button>
            <button
              type="submit"
              className={styles.btnSubmit}
              disabled={generating || !location.trim()}
            >
              {generating ? t('room:aiBattlemap.generating') : t('room:aiBattlemap.generateBtn')}
            </button>
          </div>
        </form>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <GenerationProgress active={generating} />

        {generated && (
          <div className={styles.preview}>
            <img
              src={generated.previewUrl}
              alt={t('room:aiBattlemap.previewAlt')}
              className={styles.previewImg}
            />
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => void handleUseAsBackground()}
                disabled={applying}
                className={styles.btnSubmit}
              >
                {applying ? t('room:aiBattlemap.applying') : t('room:aiBattlemap.useAsBg')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

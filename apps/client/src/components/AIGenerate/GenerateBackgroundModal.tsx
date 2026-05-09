import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIImageRequest, AIImageResponse, UpdateSceneRequest } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';
import GenerationProgress from './GenerationProgress';
import PromptAssistModal from './PromptAssistModal';
import paStyles from './PromptAssistModal.module.css';
import styles from './GenerateBackgroundModal.module.css';

// P2.1 — must mirror GeminiProvider.SCENE_STYLE_MAP (server-side) for live preview.
const STYLE_KEYS = ['fantasy', 'realistic', 'sci-fi', 'cartoon', 'dark-fantasy', 'watercolor'] as const;
type StyleKey = (typeof STYLE_KEYS)[number];

const SCENE_STYLE_MAP: Record<StyleKey, string> = {
  'fantasy':      'Fantasy digital illustration, painterly',
  'realistic':    'Photorealistic, highly detailed',
  'sci-fi':       'Science fiction concept art, cinematic',
  'cartoon':      'Cartoon illustration, stylized',
  'dark-fantasy': 'Tabletop RPG dark fantasy illustration, atmospheric',
  'watercolor':   'Watercolor painting, artistic',
};

const SCENE_CONSTRAINTS =
  'tabletop RPG scene illustration, no text, no logos, no UI overlays, no watermarks, landscape orientation';

function buildImageRequest(
  subject: string,
  roomId: string,
  style: StyleKey,
  composition: string,
  locationDetails: string,
  lighting: string,
  palette: string,
): AIImageRequest {
  const req: AIImageRequest = { prompt: subject, roomId, style };
  if (composition)     req.composition     = composition;
  if (locationDetails) req.locationDetails = locationDetails;
  if (lighting)        req.lighting        = lighting;
  if (palette)         req.palette         = palette;
  return req;
}

function mapGenerateError(err: unknown, rateLimitMsg: string, safetyMsg: string, fallbackMsg: string): string {
  if (err instanceof ApiError && err.status === 429) return rateLimitMsg;
  if (err instanceof ApiError && err.kind === 'ai_safety') return safetyMsg;
  return err instanceof Error ? err.message : fallbackMsg;
}

function mapApplyError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function buildPreviewPrompt(
  subject: string,
  style: StyleKey,
  composition: string,
  locationDetails: string,
  lighting: string,
  palette: string,
): string {
  const styleDesc = SCENE_STYLE_MAP[style] ?? style;
  const parts: string[] = [subject];
  if (composition)     parts.push(composition);
  if (locationDetails) parts.push(locationDetails);
  if (lighting)        parts.push(lighting);
  if (palette)         parts.push(palette);
  return `${styleDesc}: ${parts.join(', ')}. ${SCENE_CONSTRAINTS}`;
}

interface PreviewProps {
  subject: string;
  style: StyleKey;
  composition: string;
  locationDetails: string;
  lighting: string;
  palette: string;
  label: string;
}

function PromptPreviewBlock({ subject, style, composition, locationDetails, lighting, palette, label }: PreviewProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const prompt = subject.trim()
    ? buildPreviewPrompt(subject.trim(), style, composition, locationDetails, lighting, palette)
    : '';
  if (!prompt) return null;
  return (
    <div className={styles.promptPreview}>
      <button type="button" className={styles.previewToggle} onClick={() => setOpen((v) => !v)}>
        {open ? '▼' : '▶'} {label}
      </button>
      {open && <p className={styles.previewText}>{prompt}</p>}
    </div>
  );
}

interface Props {
  roomId: string;
  sceneId: string;
  onClose: () => void;
}

export default function GenerateBackgroundModal({ roomId, sceneId, onClose }: Props): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);

  const [subject, setSubject]               = useState('');
  const [style, setStyle]                   = useState<StyleKey>('fantasy');
  const [composition, setComposition]       = useState('');
  const [locationDetails, setLocationDetails] = useState('');
  const [lighting, setLighting]             = useState('');
  const [palette, setPalette]               = useState('');
  const [generated, setGenerated]   = useState<AIImageResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);

  function handleAssistApply(draft: string): void {
    // Apply the generated draft as the canonical Subject and clear the
    // optional structured fields — the draft already encodes them.
    setSubject(draft);
    setComposition('');
    setLocationDetails('');
    setLighting('');
    setPalette('');
  }

  async function handleGenerate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!subject.trim()) return;
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const body = buildImageRequest(subject.trim(), roomId, style, composition, locationDetails, lighting, palette);
      const result = await apiFetch<AIImageResponse>('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setGenerated(result);
    } catch (err) {
      setError(mapGenerateError(err, t('errors:api.rateLimitExceeded'), t('errors:ai.safety'), t('errors:network.generateFailed')));
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
    <div role="dialog" aria-modal="true" aria-label={t('room:aiGenerate.dialogLabel')} className={styles.backdrop}>
      <div className={styles.dialog}>
        <h2>{t('room:aiGenerate.heading')}</h2>

        <form onSubmit={(e) => void handleGenerate(e)} aria-label={t('room:aiGenerate.formLabel')} noValidate>

          {/* Subject (required) */}
          <div className={styles.field}>
            <label htmlFor="ai-subject">{t('room:aiGenerate.fields.subject')}</label>
            <textarea
              id="ai-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows={3}
              placeholder={t('room:aiGenerate.fields.subjectPlaceholder')}
              maxLength={280}
              autoFocus
            />
            <button
              type="button"
              className={paStyles.assistTrigger}
              onClick={() => setAssistOpen(true)}
              disabled={generating || applying}
            >
              {t('room:promptAssist.openBtn')}
            </button>
            <small className={styles.fieldHint}>{t('room:aiGenerate.englishHint')}</small>
          </div>

          {/* Style */}
          <div className={styles.field}>
            <label htmlFor="ai-style">{t('room:aiGenerate.fields.style')}</label>
            <select id="ai-style" value={style} onChange={(e) => setStyle(e.target.value as StyleKey)}>
              {STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{t(`room:aiGenerate.styles.${k}`)}</option>
              ))}
            </select>
          </div>

          {/* Composition (optional) */}
          <div className={styles.field}>
            <label htmlFor="ai-composition">{t('room:aiGenerate.fields.composition')}</label>
            <select id="ai-composition" value={composition} onChange={(e) => setComposition(e.target.value)}>
              <option value="">{t('room:aiGenerate.fields.compositionNone')}</option>
              {(t('room:aiGenerate.compositionPresets', { returnObjects: true }) as string[]).map((label, i) => (
                <option key={i} value={label}>{label}</option>
              ))}
            </select>
          </div>

          {/* Location details (optional) */}
          <div className={styles.field}>
            <label htmlFor="ai-location">{t('room:aiGenerate.fields.locationDetails')}</label>
            <input
              id="ai-location"
              type="text"
              maxLength={160}
              value={locationDetails}
              onChange={(e) => setLocationDetails(e.target.value)}
              placeholder={t('room:aiGenerate.fields.locationDetailsPlaceholder')}
            />
          </div>

          {/* Lighting (optional) */}
          <div className={styles.field}>
            <label htmlFor="ai-lighting">{t('room:aiGenerate.fields.lighting')}</label>
            <select id="ai-lighting" value={lighting} onChange={(e) => setLighting(e.target.value)}>
              <option value="">{t('room:aiGenerate.fields.lightingNone')}</option>
              {(t('room:aiGenerate.lightingPresets', { returnObjects: true }) as string[]).map((label, i) => (
                <option key={i} value={label}>{label}</option>
              ))}
            </select>
          </div>

          {/* Palette (optional) */}
          <div className={styles.field}>
            <label htmlFor="ai-palette">{t('room:aiGenerate.fields.palette')}</label>
            <input
              id="ai-palette"
              type="text"
              maxLength={120}
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              placeholder={t('room:aiGenerate.fields.palettePlaceholder')}
            />
          </div>

          <PromptPreviewBlock
            subject={subject}
            style={style}
            composition={composition}
            locationDetails={locationDetails}
            lighting={lighting}
            palette={palette}
            label={t('room:aiGenerate.previewLabel')}
          />

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={generating || applying}>
              {t('common:btn.cancel')}
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={generating || !subject.trim()}>
              {generating ? t('room:aiGenerate.generating') : t('room:aiGenerate.generateBtn')}
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
            onApply={handleAssistApply}
            onClose={() => setAssistOpen(false)}
          />
        )}

        {generated && (
          <div className={styles.preview}>
            <img
              src={generated.previewUrl}
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

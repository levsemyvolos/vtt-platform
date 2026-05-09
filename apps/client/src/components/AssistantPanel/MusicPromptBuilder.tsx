import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import type { AIMusicRequest, AIMusicResponse, MusicPresetKey } from '@vtt/shared';
import { apiFetch, ApiError } from '../../api/apiFetch';
import { mapAIErrorKindToI18n } from '../../store/assistant';
import GenerationProgress from '../AIGenerate/GenerationProgress';
import PromptAssistModal from '../AIGenerate/PromptAssistModal';
import paStyles from '../AIGenerate/PromptAssistModal.module.css';
import MusicResultActions from './MusicResultActions';
import styles from './ConversationView.module.css';
import bStyles from './MusicPromptBuilder.module.css';

// P3 — UI-side preset defaults for pre-filling mood/instrumentation fields.
// The server holds the full 8-line formula (GeminiProvider.MUSIC_PRESETS).
const PRESET_KEYS: MusicPresetKey[] = ['cave', 'tavern', 'exploration', 'tension', 'combat'];

const PRESET_UI_DEFAULTS: Record<MusicPresetKey, { mood: string; instrumentation: string }> = {
  cave: {
    mood:            'eerie, tense, claustrophobic, and quietly threatening',
    instrumentation: 'low resonant sub-bass drones, occasional atonal bowed metal scrapes, sparse dissonant cello harmonics',
  },
  tavern: {
    mood:            'warm, convivial, slightly chaotic but comfortable and safe',
    instrumentation: 'solo fingerpicked nylon-string lute, quiet wooden flute, very soft hand drum (barely audible)',
  },
  exploration: {
    mood:            'contemplative, slightly melancholic, with undertones of quiet wonder and mild unease',
    instrumentation: 'slow bowed strings in sustained long tones, sparse lute motif, wind pad in high register',
  },
  tension: {
    mood:            'suspenseful, focused, cautiously nervous, slow-building dread',
    instrumentation: 'muted low strings in staccato repeated patterns, subtle brass swells, soft bowed cymbal textures',
  },
  combat: {
    mood:            'urgent, epic, dramatic, and slightly desperate — not triumphant',
    instrumentation: 'heavy staccato string ostinato, deep brass swells, taiko-style orchestral drums and bass drum',
  },
};

const MUSIC_STILL_WORKING_THRESHOLD_S = 45;

interface Props {
  roomId: string;
  /** Fired after a successful generation — parent uses it to refresh the
   *  sibling MusicHistoryList. Optional for backward compat. */
  onGenerated?: () => void;
}

export default function MusicPromptBuilder({ roomId, onGenerated }: Props): JSX.Element {
  const { t } = useTranslation('assistant');
  const [presetKey, setPresetKey] = useState<MusicPresetKey | ''>('');
  const [mood, setMood] = useState('');
  const [instrumentation, setInstrumentation] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIMusicResponse | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);

  function handleAssistApply(draft: string): void {
    // The draft already contains the full music formula (genre, mood,
    // instrumentation, tempo, hard-constraints) — push it into Mood and
    // clear the others so we don't double-stack overlapping signals.
    setPresetKey('');
    setMood(draft);
    setInstrumentation('');
  }

  function applyPreset(key: MusicPresetKey | '') {
    setPresetKey(key);
    if (key) {
      const d = PRESET_UI_DEFAULTS[key];
      setMood(d.mood);
      setInstrumentation(d.instrumentation);
    } else {
      setMood('');
      setInstrumentation('');
    }
  }

  async function runGeneration(): Promise<void> {
    const canSubmit = presetKey || mood.trim();
    if (!canSubmit || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const body: AIMusicRequest = {
        prompt: '',
        roomId,
        ...(presetKey        ? { presetKey }                         : {}),
        ...(mood.trim()      ? { mood: mood.trim() }                 : {}),
        ...(instrumentation.trim() ? { instrumentation: instrumentation.trim() } : {}),
      };
      const res = await apiFetch<AIMusicResponse>('/api/ai/music', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(res);
      onGenerated?.();
    } catch (err) {
      if (err instanceof ApiError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError(i18next.t(mapAIErrorKindToI18n(err.kind, err.status) as any));
      } else {
        setError(t('conversation.generateError'));
      }
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    void runGeneration();
  }

  const canGenerate = Boolean(presetKey || mood.trim());

  return (
    <div className={styles.generatePanel}>
      <p className={styles.generateHint}>{t('musicBuilder.hint')}</p>

      <form onSubmit={handleGenerate} noValidate>
        <div className={bStyles.field}>
          <label htmlFor="mb-preset">{t('musicBuilder.presetLabel')}</label>
          <select
            id="mb-preset"
            className={bStyles.select}
            value={presetKey}
            onChange={(e) => applyPreset(e.target.value as MusicPresetKey | '')}
          >
            <option value="">{t('musicBuilder.presetCustom')}</option>
            {PRESET_KEYS.map((k) => (
              <option key={k} value={k}>{t(`musicBuilder.presets.${k}`)}</option>
            ))}
          </select>
        </div>

        <div className={bStyles.field}>
          <label htmlFor="mb-mood">{t('musicBuilder.moodLabel')}</label>
          <textarea
            id="mb-mood"
            className={styles.textarea}
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            rows={2}
            placeholder={t('musicBuilder.moodPlaceholder')}
            maxLength={200}
          />
        </div>

        <div className={bStyles.field}>
          <label htmlFor="mb-instruments">{t('musicBuilder.instrumentsLabel')}</label>
          <textarea
            id="mb-instruments"
            className={styles.textarea}
            value={instrumentation}
            onChange={(e) => setInstrumentation(e.target.value)}
            rows={2}
            placeholder={t('musicBuilder.instrumentsPlaceholder')}
            maxLength={300}
          />
        </div>

        <button
          type="button"
          className={paStyles.assistTrigger}
          onClick={() => setAssistOpen(true)}
          disabled={generating}
        >
          {t('promptAssist.openBtn')}
        </button>

        <small className={bStyles.hint}>{t('musicBuilder.englishHint')}</small>

        <button
          type="submit"
          className={styles.generateBtn}
          disabled={generating || !canGenerate}
        >
          {generating ? t('conversation.generating') : t('conversation.generateBtn')}
        </button>
      </form>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <GenerationProgress
        active={generating}
        threshold={MUSIC_STILL_WORKING_THRESHOLD_S}
        longMessage={t('musicBuilder.generatingMsg')}
        stillWorkingMessage={t('musicBuilder.stillWorking')}
      />

      {assistOpen && (
        <PromptAssistModal
          roomId={roomId}
          target="music"
          i18nNamespace="assistant"
          onApply={handleAssistApply}
          onClose={() => setAssistOpen(false)}
        />
      )}

      {result && (
        <MusicResultActions
          roomId={roomId}
          result={result}
          presetKey={presetKey}
          onRegenerate={() => void runGeneration()}
          onDiscard={() => setResult(null)}
        />
      )}
    </div>
  );
}

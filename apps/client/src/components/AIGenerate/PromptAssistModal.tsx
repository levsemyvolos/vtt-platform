/**
 * S7.2 / P5.3 — frontend dialog for the LLM-as-prompt-generator endpoint.
 *
 * GM types a free-form brief, presses Generate → server returns a
 * structured draft (≤80 words). The draft is rendered in an editable
 * textarea so the GM can hand-tweak before applying it to the parent
 * Image/Music form. No persistence on either side.
 *
 * Locale strings live under the namespace passed in `i18nNamespace`
 * (`room` for Background/Token/Battlemap, `assistant` for Music) so the
 * call site can stay inside its existing translation bundle.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PromptAssistTarget } from '@vtt/shared';
import { promptAssist } from '../../api/ai';
import { ApiError } from '../../api/apiFetch';
import styles from './PromptAssistModal.module.css';

interface Props {
  roomId: string;
  target: PromptAssistTarget;
  /** Receives the (possibly edited) draft string. Modal closes itself
   *  via onClose after a successful apply. */
  onApply: (draft: string) => void;
  onClose: () => void;
  /** Locale namespace that holds the `promptAssist.*` keys. */
  i18nNamespace: 'room' | 'assistant';
}

const MAX_BRIEF = 1000;

function mapPromptAssistError(err: unknown, rateLimitMsg: string, safetyMsg: string, fallbackMsg: string): string {
  if (err instanceof ApiError && err.status === 429) return rateLimitMsg;
  if (err instanceof ApiError && err.kind === 'ai_safety') return safetyMsg;
  if (err instanceof ApiError && err.kind === 'ai_invalid_prompt') return err.message;
  return err instanceof Error ? err.message : fallbackMsg;
}

export default function PromptAssistModal({ roomId, target, onApply, onClose, i18nNamespace }: Props): JSX.Element {
  const { t } = useTranslation([i18nNamespace, 'common', 'errors']);
  const [brief, setBrief]         = useState('');
  const [draft, setDraft]         = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Dynamic namespace prefix (`room:` vs `assistant:`) defeats react-i18next's
  // resource-key inference, so we widen `t` to a string-keyed callable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const k = (key: string): string => (t as any)(`${i18nNamespace}:promptAssist.${key}`);

  async function runGenerate(e?: FormEvent<HTMLFormElement>): Promise<void> {
    e?.preventDefault();
    const trimmed = brief.trim();
    if (!trimmed || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await promptAssist({ roomId, target, userPrompt: trimmed });
      setDraft(res.draft);
    } catch (err) {
      setError(mapPromptAssistError(
        err,
        t('errors:api.rateLimitExceeded'),
        t('errors:ai.safety'),
        t('errors:network.generateFailed'),
      ));
    } finally {
      setGenerating(false);
    }
  }

  function handleApply(): void {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onApply(trimmed);
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const briefTooLong = brief.length > MAX_BRIEF;
  const canGenerate  = brief.trim().length > 0 && !briefTooLong && !generating;
  const canApply     = draft.trim().length > 0 && !generating;

  return (
    <div role="dialog" aria-modal="true" aria-label={k('dialogLabel')} className={styles.backdrop}>
      <div className={styles.dialog}>
        <h2>{k('heading')}</h2>
        <p className={styles.hint}>{k('hint')}</p>

        <form onSubmit={(e) => void runGenerate(e)} noValidate>
          <div className={styles.field}>
            <label htmlFor="pa-brief">{k('briefLabel')}</label>
            <textarea
              id="pa-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder={target === 'image' ? k('briefPlaceholderImage') : k('briefPlaceholderMusic')}
              maxLength={MAX_BRIEF + 32}
              autoFocus
            />
            {briefTooLong && <small className={styles.error}>{k('errorOversize')}</small>}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={generating}>
              {t('common:btn.cancel')}
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={!canGenerate}>
              {generating ? k('generating') : (draft ? k('regenerateBtn') : k('generateBtn'))}
            </button>
          </div>
        </form>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        {draft && (
          <div className={`${styles.field} ${styles.draftBox}`}>
            <label htmlFor="pa-draft">{k('draftLabel')}</label>
            <textarea
              id="pa-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
            />
            <small className={styles.hint}>{k('draftHint')}</small>
            <div className={styles.actions}>
              <button type="button" className={styles.btnSubmit} disabled={!canApply} onClick={handleApply}>
                {k('applyBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

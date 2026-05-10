import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantVariables } from '@vtt/shared';
import { useAppDispatch } from '../../store';
import { updateConversationDefaultsAction } from '../../store/assistant';
import { addToast } from '../../store/toast';
import styles from './ConversationView.module.css';

/**
 * P4 backend ruleset dropdown values — license-bounded whitelist (S3.0).
 *
 * Only systems with explicit open-license corpus are listed. Closed
 * rulebooks (D&D 5e 2024 PHB, Mothership 1e, CoC 7e core, Shadowdark
 * pending separate legal review) are NOT supported — see Bible §НФВ 4.X
 * + STRIDE T-NEW «Copyright leak via model memory» + ІМ-23.
 *
 * `value` goes to the server (used in system-prompt and stored as
 * `defaultRuleset`); `label` is rendered in the dropdown with the
 * license tag for transparency.
 */
export const RULESET_OPTIONS: ReadonlyArray<{ value: string; label: string; license: string }> = [
  { value: 'D&D 5e (SRD 5.1)', label: 'D&D 5e (SRD 5.1) — CC-BY 4.0', license: 'CC-BY 4.0' },
  { value: 'Pathfinder 2e', label: 'Pathfinder 2e — ORC', license: 'ORC' },
  { value: 'Cairn 2e', label: 'Cairn 2e — CC-BY-SA 4.0', license: 'CC-BY-SA 4.0' },
  { value: 'Dungeon World', label: 'Dungeon World — CC-BY 3.0', license: 'CC-BY 3.0' },
  { value: 'Custom', label: 'Custom / Homebrew (на відповідальність GM)', license: 'user-supplied' },
] as const;

interface Props {
  conversationId: string | null;
  /** Current form values (controlled from parent — LlmPanel keeps a copy for per-message override). */
  value: AssistantVariables;
  /** Called whenever the form mutates a field. */
  onChange: (next: AssistantVariables) => void;
  /** Whether the form is open or collapsed. */
  open: boolean;
  onToggle: (next: boolean) => void;
}

export default function ConversationVariables({ conversationId, value, onChange, open, onToggle }: Props): JSX.Element {
  const { t } = useTranslation('assistant');
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof AssistantVariables>(key: K, v: AssistantVariables[K]): void {
    const next = { ...value };
    if (v === undefined || (typeof v === 'string' && v.length === 0) || (typeof v === 'number' && (v <= 0 || Number.isNaN(v)))) {
      delete next[key];
    } else {
      // Type narrowing: assignment is sound for each K.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = v;
    }
    onChange(next);
  }

  async function handleSave(): Promise<void> {
    if (!conversationId) return;
    setSaving(true);
    try {
      const result = await dispatch(updateConversationDefaultsAction({ id: conversationId, defaults: value }));
      if (updateConversationDefaultsAction.fulfilled.match(result)) {
        dispatch(addToast('success', t('variables.toastSaved')));
      } else {
        dispatch(addToast('error', t('variables.toastSaveFailed')));
      }
    } finally {
      setSaving(false);
    }
  }

  const summaryChips: Array<{ key: string; label: string; val: string }> = [];
  if (value.ruleset)     summaryChips.push({ key: 'ruleset', label: 'Ruleset', val: value.ruleset });
  if (value.playerLevel) summaryChips.push({ key: 'level',   label: 'L',       val: String(value.playerLevel) });
  if (value.tone)        summaryChips.push({ key: 'tone',    label: 'Tone',    val: value.tone });
  if (value.outputLanguage) summaryChips.push({ key: 'lang', label: 'Lang',    val: value.outputLanguage });

  return (
    <div className={styles.varsWrapper}>
      <button
        type="button"
        className={styles.varsToggle}
        onClick={() => onToggle(!open)}
        aria-expanded={open}
      >
        <span>{open ? '▼' : '▶'} {t('variables.title')}</span>
        {!open && summaryChips.length > 0 ? (
          <span className={styles.varsSummary}>
            {summaryChips.slice(0, 4).map((chip) => (
              <span key={chip.key} className={styles.summaryChip}>
                <strong>{chip.label}:</strong> {chip.val}
              </span>
            ))}
          </span>
        ) : !open ? (
          <span className={styles.varsSummary}>{t('variables.summaryNone')}</span>
        ) : null}
      </button>
      {open && (
        <div className={styles.varsForm}>
          <label className={styles.varsField}>
            <span>{t('variables.fields.ruleset')}</span>
            <select
              value={value.ruleset ?? ''}
              onChange={(e) => setField('ruleset', e.target.value || undefined)}
            >
              <option value="">{t('variables.fields.rulesetUnset')}</option>
              {RULESET_OPTIONS.map((rs) => (
                <option key={rs.value} value={rs.value}>{rs.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.varsField}>
            <span>{t('variables.fields.setting')}</span>
            <input
              type="text"
              maxLength={280}
              value={value.setting ?? ''}
              onChange={(e) => setField('setting', e.target.value)}
              placeholder={t('variables.fields.settingPlaceholder')}
            />
          </label>

          <label className={styles.varsField}>
            <span>{t('variables.fields.playerLevel')}</span>
            <input
              type="number"
              min={1}
              max={30}
              value={value.playerLevel ?? ''}
              onChange={(e) => setField('playerLevel', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="1–30"
            />
          </label>

          <label className={styles.varsField}>
            <span>{t('variables.fields.tone')}</span>
            <input
              type="text"
              maxLength={120}
              value={value.tone ?? ''}
              onChange={(e) => setField('tone', e.target.value)}
              placeholder={t('variables.fields.tonePlaceholder')}
            />
          </label>

          <label className={styles.varsField}>
            <span>{t('variables.fields.outputLanguage')}</span>
            <input
              type="text"
              maxLength={40}
              value={value.outputLanguage ?? ''}
              onChange={(e) => setField('outputLanguage', e.target.value)}
              placeholder={t('variables.fields.outputLanguagePlaceholder')}
            />
          </label>

          <div className={styles.varsActions}>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={!conversationId || saving}
              onClick={() => { void handleSave(); }}
            >
              {saving ? t('variables.actions.saving') : t('variables.actions.save')}
            </button>
            <p className={styles.varsHint}>{t('variables.hint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

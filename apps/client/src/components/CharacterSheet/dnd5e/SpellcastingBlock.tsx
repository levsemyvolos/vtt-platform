import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Spellcasting5e, Abilities5e, Ability } from '@vtt/shared';
import { abilityMod, proficiencyBonus, formatMod } from './calc';
import styles from './dnd5e.module.css';

export interface SpellcastingBlockProps {
  value: Spellcasting5e;
  abilityScores: Abilities5e;
  level: number | null | undefined;
  onChange: (patch: Partial<Spellcasting5e>) => void;
  disabled?: boolean;
}

const SPELL_ABILITY_VALUES: Array<Ability | ''> = ['', 'INT', 'WIS', 'CHA'];

// ---------------------------------------------------------------------------
// Sub-component: one override-able stat row (DC or attack bonus)
// ---------------------------------------------------------------------------

interface OverrideRowProps {
  label: string;
  display: string;
  ariaLabel: string;
  overrideLabel: string;
  overrideAriaLabel: string;
  overrideValueAriaLabel: string;
  showOverride: boolean;
  overrideValue: number | null | undefined;
  disabled: boolean;
  canOverride: boolean;
  onToggleOverride: (on: boolean) => void;
  onChangeOverrideValue: (v: number | null) => void;
}

function OverrideStatRow({
  label,
  display,
  ariaLabel,
  overrideLabel,
  overrideAriaLabel,
  overrideValueAriaLabel,
  showOverride,
  overrideValue,
  disabled,
  canOverride,
  onToggleOverride,
  onChangeOverrideValue,
}: OverrideRowProps) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.statLabel} style={{ minWidth: '9rem' }}>
        {label}
      </span>
      <span className={styles.modBadge} aria-label={ariaLabel}>
        {display}
      </span>
      <label className={styles.overrideRow}>
        <input
          type="checkbox"
          checked={showOverride}
          disabled={disabled || !canOverride}
          aria-label={overrideAriaLabel}
          onChange={(e) => onToggleOverride(e.target.checked)}
        />
        {overrideLabel}
      </label>
      {showOverride && (
        <input
          type="number"
          value={overrideValue ?? ''}
          disabled={disabled}
          aria-label={overrideValueAriaLabel}
          style={{ width: '3.5rem', textAlign: 'center' }}
          onChange={(e) =>
            onChangeOverrideValue(e.target.value === '' ? null : Number(e.target.value))
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computedDc(ab: Ability, scores: Abilities5e, level: number | null | undefined): number {
  return 8 + proficiencyBonus(level) + abilityMod(scores[ab]);
}

function computedAtk(ab: Ability, scores: Abilities5e, level: number | null | undefined): number {
  return proficiencyBonus(level) + abilityMod(scores[ab]);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Spellcasting meta block: ability select, save DC, attack bonus.
 * Override inputs are hidden by default; "Use override" checkbox reveals them.
 */
export default function SpellcastingBlock({
  value,
  abilityScores,
  level,
  onChange,
  disabled = false,
}: SpellcastingBlockProps) {
  const { t } = useTranslation('campaign');

  const [showDcOverride, setShowDcOverride] = useState(
    typeof value.saveDcOverride === 'number',
  );
  const [showAtkOverride, setShowAtkOverride] = useState(
    typeof value.attackBonusOverride === 'number',
  );

  const ab = value.spellAbility ?? null;
  const autoDc = ab ? computedDc(ab, abilityScores, level) : null;
  const autoAtk = ab ? computedAtk(ab, abilityScores, level) : null;

  const displayDc =
    typeof value.saveDcOverride === 'number'
      ? String(value.saveDcOverride)
      : autoDc !== null
        ? String(autoDc)
        : '—';

  const displayAtk =
    typeof value.attackBonusOverride === 'number'
      ? formatMod(value.attackBonusOverride)
      : autoAtk !== null
        ? formatMod(autoAtk)
        : '—';

  function handleDcOverrideToggle(on: boolean) {
    setShowDcOverride(on);
    if (!on) onChange({ saveDcOverride: null });
  }

  function handleAtkOverrideToggle(on: boolean) {
    setShowAtkOverride(on);
    if (!on) onChange({ attackBonusOverride: null });
  }

  const overrideLabel = t('dnd5e.actions.useOverride');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Spellcasting ability */}
      <div className={styles.fieldRow}>
        <span className={styles.statLabel} style={{ minWidth: '9rem' }}>
          {t('dnd5e.section.spellAbility')}
        </span>
        <select
          value={value.spellAbility ?? ''}
          disabled={disabled}
          aria-label={t('dnd5e.section.spellAbility')}
          onChange={(e) =>
            onChange({
              spellAbility: e.target.value === '' ? null : (e.target.value as Ability),
            })
          }
        >
          {SPELL_ABILITY_VALUES.map((opt) => (
            <option key={opt} value={opt}>
              {opt === '' ? '—' : t(`dnd5e.ability.${opt}.short`)}
            </option>
          ))}
        </select>
      </div>

      <OverrideStatRow
        label={t('dnd5e.section.spellSaveDc')}
        display={displayDc}
        ariaLabel={t('dnd5e.section.spellSaveDc')}
        overrideLabel={overrideLabel}
        overrideAriaLabel={`Override ${t('dnd5e.section.spellSaveDc')}`}
        overrideValueAriaLabel={`${t('dnd5e.section.spellSaveDc')} override value`}
        showOverride={showDcOverride}
        overrideValue={value.saveDcOverride}
        disabled={disabled}
        canOverride={ab !== null}
        onToggleOverride={handleDcOverrideToggle}
        onChangeOverrideValue={(v) => onChange({ saveDcOverride: v })}
      />

      <OverrideStatRow
        label={t('dnd5e.section.spellAttack')}
        display={displayAtk}
        ariaLabel={t('dnd5e.section.spellAttack')}
        overrideLabel={overrideLabel}
        overrideAriaLabel={`Override ${t('dnd5e.section.spellAttack')}`}
        overrideValueAriaLabel={`${t('dnd5e.section.spellAttack')} override value`}
        showOverride={showAtkOverride}
        overrideValue={value.attackBonusOverride}
        disabled={disabled}
        canOverride={ab !== null}
        onToggleOverride={handleAtkOverrideToggle}
        onChangeOverrideValue={(v) => onChange({ attackBonusOverride: v })}
      />
    </div>
  );
}

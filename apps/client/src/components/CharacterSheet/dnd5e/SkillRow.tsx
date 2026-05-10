/**
 * SkillRow: single button cycling through tiers ○ → ● → ★ → ○ on click.
 * UX rationale: a single pill button is more compact than three radios for 18 rows;
 * the symbols (○ none, ● proficient, ★ expertise) are universally recognizable in
 * TTRPG tools. Screen readers get full aria-label describing current tier.
 */
import { useTranslation } from 'react-i18next';
import type { SkillId, SkillProf } from '@vtt/shared';
import { SKILL_ABILITY } from '@vtt/shared';
import { formatMod } from './calc';
import styles from './dnd5e.module.css';

const TIER_SEQUENCE: SkillProf[] = ['none', 'proficient', 'expertise'];
const TIER_SYMBOL: Record<SkillProf, string> = {
  none: '○',
  proficient: '●',
  expertise: '★',
};
const TIER_STYLE: Record<SkillProf, string | undefined> = {
  none: undefined,
  proficient: styles['tierPill--proficient'],
  expertise: styles['tierPill--expertise'],
};

export interface SkillRowProps {
  skillId: SkillId;
  tier: SkillProf;
  modValue: number;
  onChangeTier: (next: SkillProf) => void;
  disabled?: boolean;
}

export default function SkillRow({
  skillId,
  tier,
  modValue,
  onChangeTier,
  disabled = false,
}: SkillRowProps) {
  const { t } = useTranslation('campaign');
  const ab = SKILL_ABILITY[skillId];
  const currentIdx = TIER_SEQUENCE.indexOf(tier);
  const nextTier: SkillProf = TIER_SEQUENCE[((currentIdx === -1 ? 0 : currentIdx) + 1) % 3] ?? 'none';
  const pillStyle = [styles.tierPill, TIER_STYLE[tier]]
    .filter(Boolean)
    .join(' ');

  const skillName = t(`dnd5e.skill.${skillId}`);
  const tierLabel = t(`dnd5e.tier.${tier}`);
  const abShort = t(`dnd5e.ability.${ab}.short`);

  return (
    <div className={styles.skillRow}>
      <button
        type="button"
        className={pillStyle}
        disabled={disabled}
        aria-label={`${skillName} proficiency: ${tierLabel}`}
        onClick={() => onChangeTier(nextTier)}
      >
        {TIER_SYMBOL[tier]}
      </button>
      <span className={styles.skillName}>
        {skillName}
        <span className={styles.abilityTag}>({abShort})</span>
      </span>
      <span className={styles.skillLeader} aria-hidden="true" />
      <span className={styles.modBadge} aria-label={`${skillName} modifier`}>
        {formatMod(modValue)}
      </span>
    </div>
  );
}

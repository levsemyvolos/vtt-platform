import { useTranslation } from 'react-i18next';
import type { Ability } from '@vtt/shared';
import { formatMod } from './calc';
import styles from './dnd5e.module.css';

export interface SaveRowProps {
  ability: Ability;
  proficient: boolean;
  modValue: number;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}

/** One saving throw row: checkbox · ability label · modifier. Mod pre-computed by parent. */
export default function SaveRow({
  ability,
  proficient,
  modValue,
  onToggle,
  disabled = false,
}: SaveRowProps) {
  const { t } = useTranslation('campaign');
  const abilityFull = t(`dnd5e.ability.${ability}.full`);
  const abilityShort = t(`dnd5e.ability.${ability}.short`);

  return (
    <div className={styles.fieldRow}>
      <input
        type="checkbox"
        className={styles.profCheckbox}
        checked={proficient}
        disabled={disabled}
        aria-label={`${abilityFull} saving throw proficiency`}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span style={{ flex: 1, fontSize: '0.8125rem' }}>{abilityShort}</span>
      <span className={styles.modBadge} aria-label={`${abilityFull} saving throw modifier`}>
        {formatMod(modValue)}
      </span>
    </div>
  );
}

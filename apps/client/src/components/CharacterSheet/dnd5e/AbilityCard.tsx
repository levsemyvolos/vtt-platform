import { useTranslation } from 'react-i18next';
import type { Ability } from '@vtt/shared';
import { abilityMod, formatMod } from './calc';
import styles from './dnd5e.module.css';

export interface AbilityCardProps {
  ability: Ability;
  score: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/** Displays a single ability score (e.g. STR) with its auto-computed modifier. */
export default function AbilityCard({
  ability,
  score,
  onChange,
  disabled = false,
}: AbilityCardProps) {
  const { t } = useTranslation('campaign');
  const mod = abilityMod(score);

  return (
    <div className={styles.abilityCard}>
      <span className={styles.abilityLabel} aria-hidden="true">
        {t(`dnd5e.ability.${ability}.short`)}
      </span>
      <input
        type="number"
        className={styles.statInput}
        value={score}
        min={1}
        max={30}
        disabled={disabled}
        aria-label={t(`dnd5e.ability.${ability}.full`)}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
      <span className={styles.modBadge} aria-label={`${t(`dnd5e.ability.${ability}.full`)} modifier`}>
        {formatMod(mod)}
      </span>
    </div>
  );
}

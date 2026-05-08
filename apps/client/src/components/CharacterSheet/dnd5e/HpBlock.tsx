import { useTranslation } from 'react-i18next';
import styles from './dnd5e.module.css';

export interface HpBlockProps {
  hp: number | null;
  maxHp: number | null;
  tempHp: number | null;
  onChange: (patch: Partial<{ hp: number | null; maxHp: number | null; tempHp: number | null }>) => void;
  disabled?: boolean;
}

function numOrNull(raw: string): number | null {
  return raw === '' ? null : Number(raw);
}

/** Three labeled HP inputs: Current HP / Max HP / Temp HP. */
export default function HpBlock({
  hp,
  maxHp,
  tempHp,
  onChange,
  disabled = false,
}: HpBlockProps) {
  const { t } = useTranslation('campaign');

  return (
    <div className={styles.hpRow}>
      <div className={styles.statGroup}>
        <span className={styles.statLabel}>{t('dnd5e.section.currentHp')}</span>
        <input
          type="number"
          className={styles.statInput}
          value={hp ?? ''}
          disabled={disabled}
          aria-label={t('dnd5e.section.currentHp')}
          onChange={(e) => onChange({ hp: numOrNull(e.target.value) })}
        />
      </div>
      <div className={styles.statGroup}>
        <span className={styles.statLabel}>{t('dnd5e.section.maxHp')}</span>
        <input
          type="number"
          className={styles.statInput}
          value={maxHp ?? ''}
          min={0}
          disabled={disabled}
          aria-label={t('dnd5e.section.maxHp')}
          onChange={(e) => onChange({ maxHp: numOrNull(e.target.value) })}
        />
      </div>
      <div className={styles.statGroup}>
        <span className={styles.statLabel}>{t('dnd5e.section.tempHp')}</span>
        <input
          type="number"
          className={styles.statInput}
          value={tempHp ?? ''}
          min={0}
          disabled={disabled}
          aria-label={t('dnd5e.section.tempHp')}
          onChange={(e) => onChange({ tempHp: numOrNull(e.target.value) })}
        />
      </div>
    </div>
  );
}

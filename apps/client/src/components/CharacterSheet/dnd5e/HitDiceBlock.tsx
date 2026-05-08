import { useTranslation } from 'react-i18next';
import styles from './dnd5e.module.css';

type DieType = 'd6' | 'd8' | 'd10' | 'd12';

export interface HitDiceBlockProps {
  total: number | null;
  used: number | null;
  type: DieType | undefined;
  onChange: (patch: Partial<{ total: number | null; used: number | null; type: DieType | undefined }>) => void;
  disabled?: boolean;
}

const DIE_OPTIONS: DieType[] = ['d6', 'd8', 'd10', 'd12'];

function numOrNull(raw: string): number | null {
  return raw === '' ? null : Number(raw);
}

/** Hit dice block: total input + used input + die-type select. */
export default function HitDiceBlock({
  total,
  used,
  type,
  onChange,
  disabled = false,
}: HitDiceBlockProps) {
  const { t } = useTranslation('campaign');

  return (
    <div className={styles.hpRow}>
      <div className={styles.statGroup}>
        <span className={styles.statLabel}>{t('dnd5e.section.hitDiceTotal')}</span>
        <input
          type="number"
          className={styles.statInput}
          value={total ?? ''}
          min={0}
          disabled={disabled}
          aria-label={t('dnd5e.section.hitDiceTotal')}
          onChange={(e) => onChange({ total: numOrNull(e.target.value) })}
        />
      </div>
      <div className={styles.statGroup}>
        <span className={styles.statLabel}>{t('dnd5e.section.hitDiceUsed')}</span>
        <input
          type="number"
          className={styles.statInput}
          value={used ?? ''}
          min={0}
          disabled={disabled}
          aria-label={t('dnd5e.section.hitDiceUsed')}
          onChange={(e) => onChange({ used: numOrNull(e.target.value) })}
        />
      </div>
      <div className={styles.statGroup}>
        <span className={styles.statLabel}>{t('dnd5e.section.hitDiceType')}</span>
        <select
          value={type ?? ''}
          disabled={disabled}
          aria-label={t('dnd5e.section.hitDiceType')}
          onChange={(e) =>
            onChange({ type: e.target.value === '' ? undefined : (e.target.value as DieType) })
          }
        >
          <option value="">—</option>
          {DIE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

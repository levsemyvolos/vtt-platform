/**
 * VitalsStrip — controlled component displaying 6 nullable numeric vitals
 * (HP, MaxHP, TempHP, AC, Initiative override, Speed) in a horizontal layout.
 *
 * Empty input → null. Displays "—" placeholder when value is null/undefined.
 */
import { useTranslation } from 'react-i18next';
import type { VitalsBlock } from '@vtt/shared';
import styles from './VitalsStrip.module.css';

export interface VitalsStripProps {
  vitals: VitalsBlock;
  onChange: (patch: Partial<VitalsBlock>) => void;
  disabled?: boolean;
}

type SectionKey =
  | 'dnd5e.section.currentHp'
  | 'dnd5e.section.maxHp'
  | 'dnd5e.section.tempHp'
  | 'dnd5e.section.armorClass'
  | 'dnd5e.section.initiative'
  | 'dnd5e.section.speed';

interface FieldDef {
  key: keyof VitalsBlock;
  sectionKey: SectionKey;
}

const FIELDS: FieldDef[] = [
  { key: 'hp',                sectionKey: 'dnd5e.section.currentHp' },
  { key: 'maxHp',             sectionKey: 'dnd5e.section.maxHp' },
  { key: 'tempHp',            sectionKey: 'dnd5e.section.tempHp' },
  { key: 'ac',                sectionKey: 'dnd5e.section.armorClass' },
  { key: 'initiativeOverride', sectionKey: 'dnd5e.section.initiative' },
  { key: 'speed',             sectionKey: 'dnd5e.section.speed' },
];

export default function VitalsStrip({ vitals, onChange, disabled = false }: VitalsStripProps): JSX.Element {
  const { t } = useTranslation('campaign');

  function handleChange(key: keyof VitalsBlock, raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '—') {
      onChange({ [key]: null });
      return;
    }
    const parsed = parseInt(trimmed, 10);
    if (!Number.isNaN(parsed)) {
      onChange({ [key]: parsed });
    }
  }

  return (
    <section aria-label={t('dnd5e.section.vitals')} className={styles.strip}>
      {FIELDS.map(({ key, sectionKey }) => {
        const value = vitals[key];
        const displayValue = value !== null && value !== undefined ? String(value) : '';
        const label = t(sectionKey);
        return (
          <div key={key} className={styles.field}>
            <label className={styles.label} htmlFor={`vitals-${key}`}>
              {label}
            </label>
            <input
              id={`vitals-${key}`}
              type="number"
              className={styles.input}
              value={displayValue}
              placeholder="—"
              aria-label={label}
              disabled={disabled}
              onChange={(e) => { handleChange(key, e.target.value); }}
            />
          </div>
        );
      })}
    </section>
  );
}

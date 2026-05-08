import { useTranslation } from 'react-i18next';
import type { Personality5e } from '@vtt/shared';
import styles from './dnd5e.module.css';

export interface PersonalityBlockProps {
  value: Personality5e;
  onChange: (patch: Partial<Personality5e>) => void;
  disabled?: boolean;
}

type PersonalityKey = keyof Personality5e;

const FIELD_KEYS: Array<{ key: PersonalityKey; rows: number }> = [
  { key: 'traits', rows: 3 },
  { key: 'ideals', rows: 3 },
  { key: 'bonds', rows: 3 },
  { key: 'flaws', rows: 3 },
  { key: 'features', rows: 4 },
];

type PersonalityI18nKey =
  | 'dnd5e.section.traits'
  | 'dnd5e.section.ideals'
  | 'dnd5e.section.bonds'
  | 'dnd5e.section.flaws'
  | 'dnd5e.section.features';

const FIELD_I18N: Record<PersonalityKey, PersonalityI18nKey> = {
  traits: 'dnd5e.section.traits',
  ideals: 'dnd5e.section.ideals',
  bonds: 'dnd5e.section.bonds',
  flaws: 'dnd5e.section.flaws',
  features: 'dnd5e.section.features',
};

/** Five textarea fields: traits, ideals, bonds, flaws, features. */
export default function PersonalityBlock({
  value,
  onChange,
  disabled = false,
}: PersonalityBlockProps) {
  const { t } = useTranslation('campaign');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {FIELD_KEYS.map(({ key, rows }) => {
        const i18nKey = FIELD_I18N[key];
        const label = t(i18nKey);
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
              {label}
            </label>
            <textarea
              className={styles.personalityField}
              rows={rows}
              value={value[key] ?? ''}
              disabled={disabled}
              aria-label={label}
              onChange={(e) => onChange({ [key]: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}

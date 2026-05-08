import { useTranslation } from 'react-i18next';
import type { SheetMode } from '@vtt/shared';
import styles from './SystemSelector.module.css';

interface Props {
  value: SheetMode;
  onChange: (next: SheetMode) => void;
  disabled?: boolean;
}

const MODES: ReadonlyArray<SheetMode> = ['5e', 'pdf', 'vitals'];

export default function SystemSelector({ value, onChange, disabled }: Props): JSX.Element {
  const { t } = useTranslation('campaign');
  const labelFor = (m: SheetMode): string => {
    if (m === '5e') return t('dnd5e.system.fiveE');
    if (m === 'pdf') return t('dnd5e.system.pdf');
    return t('dnd5e.system.vitals');
  };
  return (
    <div role="radiogroup" aria-label={t('dnd5e.system.label')} className={styles.group}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          disabled={disabled}
          onClick={() => { if (value !== m) onChange(m); }}
          className={`${styles.opt}${value === m ? ` ${styles.optActive}` : ''}`}
        >
          {labelFor(m)}
        </button>
      ))}
    </div>
  );
}

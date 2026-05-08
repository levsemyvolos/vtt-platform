import { useTranslation } from 'react-i18next';
import type { SpellSlot } from '@vtt/shared';
import styles from './dnd5e.module.css';

export interface SpellSlotsProps {
  slots: SpellSlot[];
  onChange: (next: SpellSlot[]) => void;
  disabled?: boolean;
}

/** 9-row spell slot tracker (levels 1-9), each with current and max inputs. */
export default function SpellSlots({
  slots,
  onChange,
  disabled = false,
}: SpellSlotsProps) {
  const { t } = useTranslation('campaign');

  function updateSlot(index: number, patch: Partial<SpellSlot>) {
    const next = slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  // Ensure we always render exactly 9 rows
  const rows = Array.from({ length: 9 }, (_, i) => slots[i] ?? { current: 0, max: 0 });
  const levelLabel = t('dnd5e.identity.level');

  return (
    <div>
      {rows.map((slot, i) => (
        <div key={i} className={styles.slotRow}>
          <span className={styles.slotLevelLabel}>{levelLabel} {i + 1}</span>
          <input
            type="number"
            value={slot.current}
            min={0}
            max={slot.max}
            disabled={disabled}
            aria-label={`${levelLabel} ${i + 1} current slots`}
            style={{ width: '3rem', textAlign: 'center' }}
            onChange={(e) => updateSlot(i, { current: Number(e.target.value) })}
          />
          <span aria-hidden="true">/</span>
          <input
            type="number"
            value={slot.max}
            min={0}
            disabled={disabled}
            aria-label={`${levelLabel} ${i + 1} max slots`}
            style={{ width: '3rem', textAlign: 'center' }}
            onChange={(e) => updateSlot(i, { max: Number(e.target.value) })}
          />
        </div>
      ))}
    </div>
  );
}

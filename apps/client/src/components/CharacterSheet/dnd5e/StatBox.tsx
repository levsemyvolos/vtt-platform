import styles from './dnd5e.module.css';

export interface StatBoxProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
}

/** Generic labeled numeric box. Empty input emits null. Used for AC / Initiative / Speed. */
export default function StatBox({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  placeholder,
}: StatBoxProps) {
  return (
    <div className={styles.statGroup}>
      <span className={styles.statLabel}>{label}</span>
      <input
        type="number"
        className={styles.statInput}
        value={value ?? ''}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </div>
  );
}

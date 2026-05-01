import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export type TabsVariant = 'pill' | 'underline' | 'segmented';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
  /** When set, tab renders but click shows toast (toast-strategy for unbound features). */
  unbound?: boolean;
}

export interface TabsProps<T extends string = string> {
  variant?: TabsVariant;
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  /** Called when an unbound tab is clicked (instead of onChange). */
  onUnboundClick?: (id: T) => void;
  className?: string;
}

export default function Tabs<T extends string = string>({
  variant = 'underline',
  items,
  value,
  onChange,
  onUnboundClick,
  ariaLabel,
  className,
}: TabsProps<T>) {
  const rootCls = [
    styles.tabs,
    styles[`variant-${variant}`],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootCls} role="tablist" aria-label={ariaLabel}>
      {items.map((it) => {
        const selected = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={it.disabled || undefined}
            disabled={it.disabled}
            className={[
              styles.tab,
              selected ? styles.selected : '',
              it.unbound ? styles.unbound : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (it.disabled) return;
              if (it.unbound) onUnboundClick?.(it.id);
              else onChange(it.id);
            }}
          >
            {it.icon && <span className={styles.icon} aria-hidden="true">{it.icon}</span>}
            <span className={styles.label}>{it.label}</span>
            {typeof it.count === 'number' && (
              <span className={styles.count} aria-hidden="true">
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

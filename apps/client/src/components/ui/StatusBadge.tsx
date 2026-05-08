import { type ReactNode } from 'react';
import styles from './StatusBadge.module.css';

export type StatusBadgeTone = 'neutral' | 'live' | 'danger';

interface StatusBadgeProps {
  tone?: StatusBadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export default function StatusBadge({ tone = 'neutral', dot = true, children }: StatusBadgeProps) {
  const cls = [styles.badge, tone !== 'neutral' ? styles[tone] : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </div>
  );
}

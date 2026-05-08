import { useEffect, useState } from 'react';
import styles from './HPBar.module.css';

export interface HPBarProps {
  current: number;
  max: number;
  /** How many HP were just lost (shows as wound for 3s after event) */
  recentDamage?: number;
}

export default function HPBar({ current, max, recentDamage = 0 }: HPBarProps) {
  const [showWound, setShowWound] = useState(recentDamage > 0);

  useEffect(() => {
    if (recentDamage <= 0) { setShowWound(false); return; }
    setShowWound(true);
    const id = setTimeout(() => setShowWound(false), 3000);
    return () => clearTimeout(id);
  }, [recentDamage]);

  const fullPct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const woundPct = showWound ? Math.min(100 - fullPct, (recentDamage / max) * 100) : 0;

  return (
    <div
      className={styles.bar}
      role="meter"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`HP ${current} of ${max}`}
    >
      <div className={styles.full} style={{ width: `${fullPct}%` }} />
      {showWound && <div className={styles.wound} style={{ width: `${woundPct}%` }} />}
      <div className={styles.empty} />
    </div>
  );
}

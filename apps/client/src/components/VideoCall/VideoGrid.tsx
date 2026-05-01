import type { ReactNode } from 'react';
import styles from './VideoGrid.module.css';

interface VideoGridProps {
  /** Total participant count including local (self). */
  count: number;
  children: ReactNode;
}

function gridClass(count: number): string {
  if (count <= 4) return styles.grid2x2 ?? '';
  if (count <= 6) return styles.grid2x3 ?? '';
  return styles.grid3x3 ?? '';
}

/**
 * Responsive grid wrapper for VideoTile elements.
 * Layout:  ≤4  → 2×2   |  5–6  → 2×3   |  7+  → 3×3 (audio-only fallback)
 */
export default function VideoGrid({ count, children }: VideoGridProps): JSX.Element {
  return (
    <div
      className={`${styles.grid} ${gridClass(count)}`}
      data-count={count}
    >
      {children}
    </div>
  );
}

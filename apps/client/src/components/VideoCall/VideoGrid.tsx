import type { ReactNode } from 'react';

interface VideoGridProps {
  /** Total participant count including local (self). */
  count: number;
  children: ReactNode;
}

function gridModifier(count: number): string {
  if (count <= 4) return '2x2';
  if (count <= 6) return '2x3';
  return '3x3';
}

/**
 * Responsive grid wrapper for VideoTile elements.
 * Layout:  ≤4  → 2×2   |  5–6  → 2×3   |  7+  → 3×3 (audio-only fallback)
 */
export default function VideoGrid({ count, children }: VideoGridProps): JSX.Element {
  return (
    <div
      className={`video-grid video-grid--${gridModifier(count)}`}
      data-count={count}
    >
      {children}
    </div>
  );
}

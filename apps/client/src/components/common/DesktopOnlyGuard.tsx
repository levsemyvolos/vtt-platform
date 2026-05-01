import type { ReactNode } from 'react';
import styles from './DesktopOnlyGuard.module.css';

interface Props {
  children: ReactNode;
}

/**
 * НФВ 5.1 — Responsive ≥1280px.
 * Shows a full-screen overlay on viewports narrower than 1280 px.
 * The children are always mounted (background) so state is preserved.
 */
export default function DesktopOnlyGuard({ children }: Props): JSX.Element {
  return (
    <>
      <div
        className={styles.banner}
        role="alert"
        aria-live="polite"
        aria-label="Desktop only notice"
      >
        <span className={styles.icon} aria-hidden="true">🖥</span>
        <p className={styles.title}>Mobile/tablet not supported</p>
        <p className={styles.subtitle}>Please use a desktop browser with a width of at least 1280 px.</p>
      </div>
      {children}
    </>
  );
}

import type { ReactNode } from 'react';
import LeftNav from './LeftNav';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Persistent shell for authenticated post-login screens (Dashboard, Settings).
 * NOT used for GameRoom / SceneEditor — those have their own full-bleed layout.
 *
 * Layout: 240 px sticky left nav + 1fr content area.
 */
export default function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={styles.aside} aria-label="Головна навігація">
        <LeftNav />
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

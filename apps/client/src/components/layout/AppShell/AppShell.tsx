import type { ReactNode } from 'react';
import TopBar from './TopBar';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  subBar?: ReactNode;
}

/**
 * Persistent shell for authenticated post-login screens (Dashboard, Settings).
 * NOT used for GameRoom / SceneEditor — those have their own full-bleed layout.
 *
 * Layout: sticky topbar header + scrollable main content area.
 */
export default function AppShell({ children, subBar }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <TopBar />
      {subBar && <div className={styles.subBar}>{subBar}</div>}
      <main className={styles.main}>{children}</main>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Logo } from '../ui';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps): JSX.Element {
  return (
    <div className={styles.background}>
      <div className={styles.logoCorner}>
        <Logo size={28} />
        <span className={styles.logoText}>VTT</span>
      </div>
      <div className={styles.card}>
        {children}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Logo } from '../ui';
import ThemeToggle from '../Header/ThemeToggle';
import LanguageSwitcher from '../Header/LanguageSwitcher';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps): JSX.Element {
  return (
    <div className={styles.background}>
      <div className={styles.logoCorner}>
        <Logo size={28} />
      </div>
      <div className={styles.controls}>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className={`glass glass-faint ${styles.card}`}>
        {children}
      </div>
    </div>
  );
}

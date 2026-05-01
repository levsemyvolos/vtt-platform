import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  return (
    <>
      <div
        className={styles.banner}
        role="alert"
        aria-live="polite"
        aria-label={t('desktopGuard.title')}
      >
        <span className={styles.icon} aria-hidden="true">🖥</span>
        <p className={styles.title}>{t('desktopGuard.title')}</p>
        <p className={styles.subtitle}>{t('desktopGuard.subtitle')}</p>
      </div>
      {children}
    </>
  );
}

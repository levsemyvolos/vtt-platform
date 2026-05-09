import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GenerateBackgroundModal.module.css';

const DEFAULT_THRESHOLD_S = 25;

interface Props {
  active: boolean;
  threshold?: number;
  longMessage?: string;
  stillWorkingMessage?: string;
}

export default function GenerationProgress({ active, threshold = DEFAULT_THRESHOLD_S, longMessage, stillWorkingMessage }: Props): JSX.Element | null {
  const { t } = useTranslation('room');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const message =
    elapsed >= threshold
      ? (stillWorkingMessage ?? t('aiCommon.expectationStillWorking'))
      : (longMessage ?? t('aiCommon.expectationLong'));

  return (
    <div className={styles.progress} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.skeleton} aria-label={t('aiCommon.skeletonAlt')} />
      <p className={styles.progressText}>{message}</p>
    </div>
  );
}

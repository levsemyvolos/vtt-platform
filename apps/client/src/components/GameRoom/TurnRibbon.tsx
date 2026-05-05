import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../store';
import styles from './TurnRibbon.module.css';

export default function TurnRibbon(): JSX.Element | null {
  const { t } = useTranslation('gameroom');
  const entries = useAppSelector((s) => s.initiative.entries);
  const round = useAppSelector((s) => s.initiative.currentRound);

  if (entries.length === 0) return null;

  const active = entries.find((e) => e.isCurrent) ?? entries[0];
  if (!active) return null;

  return (
    <div className={styles.ribbon} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden>●</span>
      {t('turnRibbon.format', { name: active.name.toUpperCase(), round: round || 1 })}
    </div>
  );
}

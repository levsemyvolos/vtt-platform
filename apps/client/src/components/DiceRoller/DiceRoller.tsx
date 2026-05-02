import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DiceBox from '@3d-dice/dice-box';
import type { DiceMode } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { emitDiceRoll } from '../../api/socket';
import { Button, Input, Tabs, type TabItem } from '../ui';
import styles from './DiceRoller.module.css';

interface DiceRollerProps {
  roomId: string;
}

export default function DiceRoller({ roomId }: DiceRollerProps): JSX.Element {
  const { t } = useTranslation(['room', 'errors']);
  const containerRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<DiceBox | null>(null);
  const [expression, setExpression] = useState('1d20');
  const [mode, setMode] = useState<DiceMode>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastDice = useAppSelector((s) =>
    s.chat.messages.filter((m) => m.rollPayload).slice(-1)[0],
  );

  useEffect(() => {
    if (!containerRef.current || dbRef.current) return;
    const selector = `#${containerRef.current.id}`;
    const box = new DiceBox(selector, {
      assetPath: '/assets/dice-box/',
      theme: 'default',
      scale: 6,
    });
    box.init().then(() => { dbRef.current = box; }).catch(() => { dbRef.current = null; });
    return () => { dbRef.current = null; };
  }, []);

  async function handleRoll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await emitDiceRoll({ roomId, expression, mode });
      const box = dbRef.current;
      if (box) {
        try { box.clear(); await box.roll(expression); } catch { /* visual only */ }
      }
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.rollFailed'));
    } finally {
      setBusy(false);
    }
  }

  const MODE_TABS: ReadonlyArray<TabItem<DiceMode>> = [
    { id: 'normal', label: t('dice.modes.normal') },
    { id: 'advantage', label: t('dice.modes.advantage') },
    { id: 'disadvantage', label: t('dice.modes.disadvantage') },
    { id: 'secret', label: t('dice.modes.secret') },
  ];

  return (
    <section className={styles.roller} aria-label={t('dice.rollerLabel', { defaultValue: 'Dice roller' })}>
      <div
        ref={containerRef}
        id="dice-roller-canvas"
        className={styles.canvas}
        aria-hidden="true"
      />
      <div className={styles.controls}>
        <Input
          className={styles.formulaInput}
          aria-label={t('dice.formulaLabel')}
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="2d6+3"
        />
        <Tabs
          variant="segmented"
          items={MODE_TABS}
          value={mode}
          onChange={setMode}
          ariaLabel={t('dice.modeLabel')}
        />
        <Button
          variant="primary"
          onClick={() => void handleRoll()}
          disabled={busy}
          aria-busy={busy}
        >
          {t('dice.rollBtn')}
        </Button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {lastDice?.rollPayload && (
        <p className={styles.last}>
          {t('dice.lastRoll', {
            expression: lastDice.rollPayload.expression,
            total: lastDice.rollPayload.total,
            rolls: lastDice.rollPayload.rolls.join(', '),
          })}
        </p>
      )}
    </section>
  );
}

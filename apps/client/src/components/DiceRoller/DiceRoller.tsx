import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DiceBox from '@3d-dice/dice-box';
import type { DiceMode } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { emitDiceRoll } from '../../api/socket';

interface DiceRollerProps {
  roomId: string;
}

/**
 * Dice input + 3D animation (sequence Process_View_DiceRoll).
 *
 * Flow: user types formula → emit `dice:roll` → server returns ChatDicePayload
 * via ack → DiceBox.roll(notation) plays the physics animation locally so the
 * roller sees a tactile result. Other clients receive `chat:dice` broadcast and
 * render text-only (no animation) — the protocol does NOT replicate physics.
 */
export default function DiceRoller({ roomId }: DiceRollerProps): JSX.Element {
  const { t } = useTranslation('room');
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
    box
      .init()
      .then(() => {
        dbRef.current = box;
      })
      .catch(() => {
        dbRef.current = null;
      });
    return () => {
      dbRef.current = null;
    };
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

  const MODES: { value: DiceMode; label: string }[] = [
    { value: 'normal', label: t('dice.modes.normal') },
    { value: 'advantage', label: t('dice.modes.advantage') },
    { value: 'disadvantage', label: t('dice.modes.disadvantage') },
    { value: 'secret', label: t('dice.modes.secret') },
  ];

  return (
    <section className="dice-roller">
      <div
        ref={containerRef}
        id="dice-roller-canvas"
        className="dice-roller__canvas"
        style={{ minHeight: 200, position: 'relative' }}
      />
      <div className="dice-roller__controls">
        <input
          aria-label={t('dice.formulaLabel')}
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="2d6+3"
        />
        <select
          aria-label={t('dice.modeLabel')}
          value={mode}
          onChange={(e) => setMode(e.target.value as DiceMode)}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button onClick={handleRoll} disabled={busy}>
          {t('dice.rollBtn')}
        </button>
      </div>
      {error && <p className="dice-roller__error">{error}</p>}
      {lastDice?.rollPayload && (
        <p className="dice-roller__last">
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

import { useEffect, useRef, useState } from 'react';
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
    const box = new DiceBox(containerRef.current, {
      assetPath: '/assets/dice-box/',
      theme: 'default',
      scale: 6,
    });
    box.init().then(() => {
      dbRef.current = box;
    }).catch(() => {
      // dice-box assets may not be served in unit-test / SSR contexts; degrade gracefully
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
      // local 3D animation — fire-and-forget
      const box = dbRef.current;
      if (box) {
        try { box.clear(); await box.roll(expression); } catch { /* visual only */ }
      }
      // store update arrives via the chat:dice listener in api/socket.ts
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Roll failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dice-roller">
      <div ref={containerRef} className="dice-roller__canvas" style={{ minHeight: 200 }} />
      <div className="dice-roller__controls">
        <input
          aria-label="Dice formula"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="2d6+3"
        />
        <select
          aria-label="Dice mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as DiceMode)}
        >
          <option value="normal">Звичайний</option>
          <option value="advantage">Перевага</option>
          <option value="disadvantage">Недолік</option>
          <option value="secret">Прихований (тільки ВМ)</option>
        </select>
        <button onClick={handleRoll} disabled={busy}>
          Кинути
        </button>
      </div>
      {error && <p className="dice-roller__error">{error}</p>}
      {lastDice?.rollPayload && (
        <p className="dice-roller__last">
          Останній: <strong>{lastDice.rollPayload.expression}</strong> ={' '}
          <strong>{lastDice.rollPayload.total}</strong>{' '}
          ({lastDice.rollPayload.rolls.join(', ')})
        </p>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box-threejs';
import { useAppDispatch, useAppSelector } from '../../store';
import { consumeDiceAnimQueue } from '../../store/diceAnim';
import styles from './DiceOverlay.module.css';

export default function DiceOverlay(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<DiceBox | null>(null);
  // Prevents starting a second animation while one is running.
  // Reset by onRollComplete (which fires even for invalid notation).
  const animatingRef = useRef(false);
  const [boxReady, setBoxReady] = useState(false);
  const queue = useAppSelector((s) => s.diceAnim.queue);
  const dispatch = useAppDispatch();

  // Init DiceBox once container has positive layout dimensions.
  // The library reads `container.clientWidth/Height` at construction time
  // (`new Ce(this.container.clientWidth, this.container.clientHeight)`), so a
  // 0×0 mount produces an invisible WebGL renderer. Defer construction via
  // ResizeObserver until the first positive size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || dbRef.current) return;

    const tryInit = (): boolean => {
      if (dbRef.current) return true;
      if (el.clientWidth <= 0 || el.clientHeight <= 0) return false;
      try {
        const box = new DiceBox(`#${el.id}`, {
          sounds: false,
          shadows: true,
          theme_surface: 'green-felt',
          theme_colorset: 'white',
          theme_material: 'plastic',
          baseScale: 80,
          gravity_multiplier: 400,
          light_intensity: 0.7,
          // Consume the queue item after animation completes, not immediately.
          // The library calls this even for invalid notation (instant resolve),
          // so the animatingRef guard is always released.
          onRollComplete: () => {
            animatingRef.current = false;
            dispatch(consumeDiceAnimQueue());
          },
        });
        dbRef.current = box;
        // The constructor only assigns config; renderer + scene + textures are
        // built inside `initialize()` (verified in dist/dice-box-threejs.es.js
        // line 16786 `async initialize()`). Without awaiting it, `roll()` is a
        // silent no-op.
        box.initialize()
          .then(() => { setBoxReady(true); })
          .catch((err) => {
            console.error('[DiceOverlay] DiceBox initialize failed:', err);
            dbRef.current = null;
          });
        return true;
      } catch (err) {
        console.error('[DiceOverlay] DiceBox construction failed:', err);
        dbRef.current = null;
        return false;
      }
    };

    if (tryInit()) {
      return () => {
        // Stop ongoing animation so requestAnimationFrame loop exits.
        try { (dbRef.current as unknown as { clearDice(): void } | null)?.clearDice(); } catch { /* ignore */ }
        dbRef.current = null;
        animatingRef.current = false;
      };
    }

    const ro = new ResizeObserver(() => {
      if (tryInit()) ro.disconnect();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      try { (dbRef.current as unknown as { clearDice(): void } | null)?.clearDice(); } catch { /* ignore */ }
      dbRef.current = null;
      animatingRef.current = false;
    };
  }, [dispatch]);

  // Drain the queue one item at a time: start next roll only after current
  // animation completes (onRollComplete clears animatingRef and dispatches
  // consumeDiceAnimQueue, which triggers this effect again for the next item).
  useEffect(() => {
    if (!boxReady || queue.length === 0 || animatingRef.current) return;
    const box = dbRef.current;
    if (!box) return;

    animatingRef.current = true;
    const item = queue[0]!;

    // d100 uses two physical d10 dice; the library cannot reliably sync the
    // face swap for percentile notation — skip 3D and surface the result only.
    if (/\bd100\b/.test(item.expression)) {
      animatingRef.current = false;
      dispatch(consumeDiceAnimQueue());
      return;
    }

    // Predetermined notation: "<expr>@<r1>,<r2>,…" — each die lands on its
    // server-rolled value. Server sends crypto.randomInt results; the library
    // calls swapDiceFace() after simulation to show the correct face.
    // NOTE: box.clear() does NOT exist on this library version — the library's
    // startClickThrow() already calls clearDice() internally when rolling=true.
    const notation = item.rolls.length > 0
      ? `${item.expression}@${item.rolls.join(',')}`
      : item.expression;
    void box.roll(notation);
  }, [boxReady, queue, dispatch]);

  return (
    <div
      ref={containerRef}
      id="dice-overlay-canvas"
      className={styles.overlay}
      aria-hidden="true"
    />
  );
}

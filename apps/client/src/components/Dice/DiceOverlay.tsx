import { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box-threejs';
import { useAppDispatch, useAppSelector } from '../../store';
import { consumeDiceAnimQueue } from '../../store/diceAnim';
import styles from './DiceOverlay.module.css';

export default function DiceOverlay(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<DiceBox | null>(null);
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

    if (tryInit()) return () => { dbRef.current = null; };

    const ro = new ResizeObserver(() => {
      if (tryInit()) ro.disconnect();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      dbRef.current = null;
    };
  }, []);

  // Drain the queue once box is ready and a new item arrives.
  useEffect(() => {
    if (!boxReady || queue.length === 0) return;
    const item = queue[0]!;
    const box = dbRef.current;
    if (!box) return;
    try {
      box.clear();
      // Predetermined notation: "<expr>@<r1>,<r2>,…" — each die lands on its server-rolled value.
      const notation = item.rolls.length > 0
        ? `${item.expression}@${item.rolls.join(',')}`
        : item.expression;
      void box.roll(notation);
    } catch {
      /* visual only */
    }
    dispatch(consumeDiceAnimQueue());
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

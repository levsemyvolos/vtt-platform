import { useEffect, useState } from 'react';
import { Layer, Circle } from 'react-konva';
import type { AnnotationPingPayload } from '@vtt/shared';
import { useAppSelector } from '../../../store';

const PING_DURATION_MS = 3000;
const PING_FADE_START_MS = 2000;

/** Per-user deterministic color derived from userId hash (зашитий palette). */
const PING_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export function getUserPingColor(userId: string): string {
  const hash = [...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PING_PALETTE[hash % PING_PALETTE.length]!;
}

/**
 * Single ping marker. Manages its own opacity animation: visible for 2 s,
 * then linearly fades to 0 over 1 s. Store cleanup is handled by socket.ts
 * setTimeout — this component does not dispatch.
 */
function PingCircle({ ping }: { ping: AnnotationPingPayload }): JSX.Element {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= PING_DURATION_MS) {
        clearInterval(id);
        return;
      }
      if (elapsed >= PING_FADE_START_MS) {
        const fadeProgress = (elapsed - PING_FADE_START_MS) / (PING_DURATION_MS - PING_FADE_START_MS);
        setOpacity(Math.max(0, 1 - fadeProgress));
      }
    }, 50);
    return () => clearInterval(id);
  }, []); // ping is stable for its lifetime

  const color = ping.color || getUserPingColor(ping.userId);

  return (
    <Circle
      x={ping.x}
      y={ping.y}
      radius={24}
      fill={color}
      opacity={opacity}
      shadowColor={color}
      shadowBlur={12}
      shadowOpacity={0.6}
      listening={false}
    />
  );
}

/**
 * Annotation layer — renders ephemeral ping markers (Ф3.4.1) and reserves
 * the layer slot for future free-draw (Ф3.4.2) and measurement (Ф3.4.3).
 * Layer order: Background → Tokens → Annotations → FoW (§2.13 table 2.9).
 */
export default function AnnotationLayer(): JSX.Element {
  const pings = useAppSelector((s) => s.annotations.activePings);

  return (
    <Layer listening={false}>
      {pings.map((ping) => (
        <PingCircle key={ping.timestamp} ping={ping} />
      ))}
    </Layer>
  );
}

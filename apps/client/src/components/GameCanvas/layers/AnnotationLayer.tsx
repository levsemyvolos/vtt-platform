import { useEffect, useState } from 'react';
import { Layer, Circle, Line, Text } from 'react-konva';
import type { AnnotationPingPayload, MeasurePayload } from '@vtt/shared';
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

/** Ruler line with distance label (Ф3.4.3). gridSize converts pixels → grid units. */
function RulerLine({ measure, gridSize }: { measure: MeasurePayload; gridSize: number }): JSX.Element {
  const color = getUserPingColor(measure.userId);
  const dx = measure.to.x - measure.from.x;
  const dy = measure.to.y - measure.from.y;
  const distPx = Math.sqrt(dx * dx + dy * dy);
  const distUnits = Math.round((distPx / gridSize) * 10) / 10;
  const midX = (measure.from.x + measure.to.x) / 2;
  const midY = (measure.from.y + measure.to.y) / 2;

  return (
    <>
      <Line
        points={[measure.from.x, measure.from.y, measure.to.x, measure.to.y]}
        stroke={color}
        strokeWidth={2}
        dash={[8, 4]}
        listening={false}
      />
      <Text
        x={midX + 4}
        y={midY - 14}
        text={`${distUnits} кл`}
        fill={color}
        fontSize={13}
        fontStyle="bold"
        listening={false}
      />
    </>
  );
}

/**
 * Annotation layer — renders ephemeral ping markers (Ф3.4.1) and ruler lines (Ф3.4.3).
 * Layer order: Background → Tokens → Annotations → FoW (§2.13 table 2.9).
 */
export default function AnnotationLayer({ gridSize = 64 }: { gridSize?: number }): JSX.Element {
  const pings = useAppSelector((s) => s.annotations.activePings);
  const measures = useAppSelector((s) => s.annotations.activeMeasures);

  return (
    <Layer listening={false}>
      {pings.map((ping) => (
        <PingCircle key={ping.timestamp} ping={ping} />
      ))}
      {measures.map((m) => (
        <RulerLine key={m.userId} measure={m} gridSize={gridSize} />
      ))}
    </Layer>
  );
}

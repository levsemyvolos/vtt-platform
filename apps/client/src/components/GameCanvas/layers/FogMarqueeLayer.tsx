import { Layer, Rect } from 'react-konva';
import type { FogMode } from '../../../store/canvasViewport';

export interface FogMarquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface FogMarqueeLayerProps {
  marquee: FogMarquee | null;
  mode: FogMode;
}

/**
 * Ephemeral drag-rectangle preview shown only while the GM is dragging a fog
 * selection (Ф3.3 input layer). Hide-mode draws red, reveal-mode green.
 */
export default function FogMarqueeLayer({
  marquee,
  mode,
}: FogMarqueeLayerProps): JSX.Element | null {
  if (!marquee) return null;
  const x = Math.min(marquee.x0, marquee.x1);
  const y = Math.min(marquee.y0, marquee.y1);
  const w = Math.abs(marquee.x1 - marquee.x0);
  const h = Math.abs(marquee.y1 - marquee.y0);
  if (w < 1 || h < 1) return null;
  const color = mode === 'hide' ? '#cc3333' : '#33cc66';
  return (
    <Layer listening={false}>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        opacity={0.18}
        stroke={color}
        strokeWidth={1.5}
        dash={[6, 4]}
      />
    </Layer>
  );
}

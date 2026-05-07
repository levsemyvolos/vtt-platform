import { Layer, Rect } from 'react-konva';
import type { SelectMarquee } from '../../../hooks/useToolHandlers';

interface Props {
  marquee: SelectMarquee | null;
}

/**
 * Sess 10.6 — translucent rubber-band rectangle drawn over the scene while
 * the user is dragging on empty stage area (select tool, GM only). Pure
 * visual — selection commit happens in useToolHandlers on mouseUp.
 */
export default function SelectMarqueeLayer({ marquee }: Props): JSX.Element | null {
  if (!marquee) return null;
  const x = Math.min(marquee.x0, marquee.x1);
  const y = Math.min(marquee.y0, marquee.y1);
  const w = Math.abs(marquee.x1 - marquee.x0);
  const h = Math.abs(marquee.y1 - marquee.y0);
  return (
    <Layer listening={false}>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="#3b82f6"
        opacity={0.12}
        stroke="#3b82f6"
        strokeWidth={1.5}
        dash={[6, 4]}
      />
    </Layer>
  );
}

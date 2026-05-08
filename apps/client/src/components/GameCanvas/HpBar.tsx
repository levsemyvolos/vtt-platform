import { Group, Rect } from 'react-konva';

interface HpBarProps {
  hp: number;
  maxHp: number | undefined;
  gridSize: number;
}

// Konva fills are not CSS-variable-aware — read computed values at call time.
// Falls back to sensible literals if called during SSR or before first paint.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export default function HpBar({ hp, maxHp, gridSize }: HpBarProps): JSX.Element {
  const ratio = maxHp != null && maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;

  const colorFull = cssVar('--vitality-hi');   // gold gradient fill
  const colorHalf = cssVar('--ember');          // torch ember — caution zone
  const colorLow  = cssVar('--blood-hi');       // wound red — critical
  const colorTrack = cssVar('--line');           // subtle border track

  const fill = ratio > 0.5 ? colorFull : ratio > 0.25 ? colorHalf : colorLow;

  return (
    <Group y={-10}>
      <Rect width={gridSize} height={5} fill={colorTrack} opacity={0.7} cornerRadius={2} />
      <Rect width={Math.round(gridSize * ratio)} height={5} fill={fill} cornerRadius={2} />
    </Group>
  );
}

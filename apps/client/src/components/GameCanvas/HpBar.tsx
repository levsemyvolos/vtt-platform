import { Group, Rect } from 'react-konva';

interface HpBarProps {
  hp: number;
  maxHp: number | undefined;
  gridSize: number;
}

// Token-aligned values (light theme; Konva fills are not CSS-variable-aware)
const COLOR_FULL = '#51cf66';    // --color-success light
const COLOR_HALF = '#ffd43b';    // --color-warning light
const COLOR_LOW  = '#ff6b6b';    // --color-danger light
const COLOR_TRACK = '#334155';   // --color-border-strong dark

export default function HpBar({ hp, maxHp, gridSize }: HpBarProps): JSX.Element {
  const ratio = maxHp != null && maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
  const fill = ratio > 0.5 ? COLOR_FULL : ratio > 0.25 ? COLOR_HALF : COLOR_LOW;
  return (
    <Group y={-10}>
      <Rect width={gridSize} height={5} fill={COLOR_TRACK} opacity={0.7} cornerRadius={2} />
      <Rect width={Math.round(gridSize * ratio)} height={5} fill={fill} cornerRadius={2} />
    </Group>
  );
}

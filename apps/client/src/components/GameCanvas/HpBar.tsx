import { Group, Rect } from 'react-konva';

interface HpBarProps {
  hp: number;
  maxHp: number | undefined;
  gridSize: number;
}

export default function HpBar({ hp, maxHp, gridSize }: HpBarProps): JSX.Element {
  const ratio = maxHp != null && maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
  const fill = ratio > 0.5 ? '#51cf66' : ratio > 0.25 ? '#ffd43b' : '#ff6b6b';
  return (
    <Group y={-10}>
      <Rect width={gridSize} height={5} fill="#333" opacity={0.7} cornerRadius={2} />
      <Rect width={Math.round(gridSize * ratio)} height={5} fill={fill} cornerRadius={2} />
    </Group>
  );
}

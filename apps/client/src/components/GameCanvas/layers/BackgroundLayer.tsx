import { Layer, Image as KonvaImage, Line, Rect } from 'react-konva';
import { useImage } from '../useImage';

interface BackgroundLayerProps {
  backgroundUrl?: string;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
}

/**
 * Bottom layer of the GameCanvas (Ф3.1.1): scene background bitmap + the
 * square grid overlay (Ф2.2.6). The grid is drawn deterministically so token
 * snapping in `TokenLayer` is visually consistent with logical cell coords.
 */
export default function BackgroundLayer({
  backgroundUrl,
  gridSize,
  gridWidth,
  gridHeight,
}: BackgroundLayerProps): JSX.Element {
  const bgImage = useImage(backgroundUrl);
  const totalW = gridWidth * gridSize;
  const totalH = gridHeight * gridSize;

  const verticals: number[] = [];
  for (let i = 0; i <= gridWidth; i++) verticals.push(i * gridSize);
  const horizontals: number[] = [];
  for (let i = 0; i <= gridHeight; i++) horizontals.push(i * gridSize);

  return (
    <Layer listening={false}>
      <Rect x={0} y={0} width={totalW} height={totalH} fill="#1f1f23" />
      {bgImage && (
        <KonvaImage image={bgImage} x={0} y={0} width={totalW} height={totalH} />
      )}
      {verticals.map((x) => (
        <Line
          key={`v-${x}`}
          points={[x, 0, x, totalH]}
          stroke="#3a3a40"
          strokeWidth={1}
        />
      ))}
      {horizontals.map((y) => (
        <Line
          key={`h-${y}`}
          points={[0, y, totalW, y]}
          stroke="#3a3a40"
          strokeWidth={1}
        />
      ))}
    </Layer>
  );
}

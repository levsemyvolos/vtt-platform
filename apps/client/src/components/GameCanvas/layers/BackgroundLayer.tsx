import { Group, Layer, Image as KonvaImage, Line, Rect } from 'react-konva';
import type { BackgroundFit } from '@vtt/shared';
import { useImage } from '../useImage';
import { computeBackgroundGeometry } from '../backgroundLayout';

interface BackgroundLayerProps {
  backgroundUrl?: string;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  gridVisible: boolean;
  fit: BackgroundFit;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Bottom layer of the GameCanvas (Ф3.1.1): scene background bitmap + the
 * square grid overlay (Ф2.2.6). The grid is drawn deterministically so token
 * snapping in `TokenLayer` is visually consistent with logical cell coords.
 *
 * Renders the background per fit mode (cover/contain/stretch) with manual
 * offset and scale. For 'cover' mode the image may overflow the scene rect, so
 * it is wrapped in a clipping Group to keep the render bounded.
 */
export default function BackgroundLayer({
  backgroundUrl,
  gridSize,
  gridWidth,
  gridHeight,
  gridVisible,
  fit,
  offsetX,
  offsetY,
  scale,
}: BackgroundLayerProps): JSX.Element {
  const bgImage = useImage(backgroundUrl);
  const totalW = gridWidth * gridSize;
  const totalH = gridHeight * gridSize;

  const geom = computeBackgroundGeometry({
    naturalWidth: bgImage?.naturalWidth ?? 0,
    naturalHeight: bgImage?.naturalHeight ?? 0,
    sceneWidth: totalW,
    sceneHeight: totalH,
    fit,
    scale,
    offsetX,
    offsetY,
  });

  const verticals: number[] = [];
  for (let i = 0; i <= gridWidth; i++) verticals.push(i * gridSize);
  const horizontals: number[] = [];
  for (let i = 0; i <= gridHeight; i++) horizontals.push(i * gridSize);

  return (
    <Layer listening={false}>
      <Rect x={0} y={0} width={totalW} height={totalH} fill="#1f1f23" />
      {bgImage && fit === 'cover' ? (
        <Group clip={{ x: 0, y: 0, width: totalW, height: totalH }}>
          <KonvaImage image={bgImage} x={geom.x} y={geom.y} width={geom.width} height={geom.height} />
        </Group>
      ) : bgImage ? (
        <KonvaImage image={bgImage} x={geom.x} y={geom.y} width={geom.width} height={geom.height} />
      ) : null}
      {gridVisible && verticals.map((x) => (
        <Line
          key={`v-${x}`}
          points={[x, 0, x, totalH]}
          stroke="#3a3a40"
          strokeWidth={1}
        />
      ))}
      {gridVisible && horizontals.map((y) => (
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

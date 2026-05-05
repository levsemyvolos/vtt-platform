import { useMemo } from 'react';
import { Layer, Image as KonvaImage } from 'react-konva';
import type { Role, FogShape } from '@vtt/shared';
import { renderFogToCanvas } from '../fogShapes';

interface FogOfWarLayerProps {
  fogShapes: FogShape[];
  sceneWidth: number;
  sceneHeight: number;
  myRole: Role;
  /** GM-only slider value (0..1). Players are forced to full opacity. */
  fowAlpha?: number;
}

/**
 * Top layer (Ф3.3) — pixel-precise fog rendered as a single `Konva.Image`
 * backed by an offscreen canvas (see `renderFogToCanvas`). One node per
 * scene, no per-shape Konva primitives, no seams between adjacent shapes.
 *
 * GM sees the layer at `fowAlpha` so they can still place tokens in hidden
 * zones; players see it fully opaque per Ф3.3.3.
 */
export default function FogOfWarLayer({
  fogShapes,
  sceneWidth,
  sceneHeight,
  myRole,
  fowAlpha = 0.7,
}: FogOfWarLayerProps): JSX.Element | null {
  const canvas = useMemo(() => {
    if (sceneWidth <= 0 || sceneHeight <= 0) return null;
    return renderFogToCanvas(fogShapes, sceneWidth, sceneHeight);
  }, [fogShapes, sceneWidth, sceneHeight]);

  if (!canvas) return null;

  const opacity = myRole === 'GM' ? fowAlpha : 0.7;

  return (
    <Layer listening={false}>
      <KonvaImage
        image={canvas}
        x={0}
        y={0}
        width={sceneWidth}
        height={sceneHeight}
        opacity={opacity}
        perfectDrawEnabled={false}
      />
    </Layer>
  );
}

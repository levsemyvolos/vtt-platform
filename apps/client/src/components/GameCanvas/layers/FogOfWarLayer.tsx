import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Image as KonvaImage } from 'react-konva';
import type { Role, FogShape, FogBitmap } from '@vtt/shared';
import { renderFogToCanvas } from '../fogShapes';

interface FogOfWarLayerProps {
  fogShapes: FogShape[];
  /** Sess 11 — compacted bitmap base; rendered before any post-compact shapes. */
  fogBitmap?: FogBitmap | null;
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
 * Sess 11 — when `fogBitmap` is non-null (post-compaction), it is drawn as
 * the base layer; remaining shapes (added during/after the compact window)
 * are overlaid on top using the same hide/reveal compositing semantics.
 *
 * GM sees the layer at `fowAlpha` so they can still place tokens in hidden
 * zones; players see it fully opaque per Ф3.3.3.
 */
export default function FogOfWarLayer({
  fogShapes,
  fogBitmap,
  sceneWidth,
  sceneHeight,
  myRole,
  fowAlpha = 0.7,
}: FogOfWarLayerProps): JSX.Element | null {
  // Sess 11 — decode the bitmap data-URL into an HTMLImageElement asynchronously;
  // re-decode only when the underlying data string changes. The hook returns
  // `null` while the image is loading or absent.
  const bitmapData = fogBitmap?.data ?? null;
  const [bitmapImage, setBitmapImage] = useState<HTMLImageElement | null>(null);
  const lastSrcRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bitmapData) {
      lastSrcRef.current = null;
      setBitmapImage(null);
      return;
    }
    if (lastSrcRef.current === bitmapData) return;
    lastSrcRef.current = bitmapData;
    const img = new Image();
    img.onload = () => {
      // Guard against a race where the GM compacts twice within a few frames
      // and the older onload resolves AFTER the newer src has been assigned.
      if (lastSrcRef.current === bitmapData) setBitmapImage(img);
    };
    img.onerror = () => {
      if (lastSrcRef.current === bitmapData) setBitmapImage(null);
    };
    img.src = bitmapData;
  }, [bitmapData]);

  const canvas = useMemo(() => {
    if (sceneWidth <= 0 || sceneHeight <= 0) return null;
    return renderFogToCanvas(fogShapes, sceneWidth, sceneHeight, undefined, fogBitmap ?? null, bitmapImage);
  }, [fogShapes, fogBitmap, bitmapImage, sceneWidth, sceneHeight]);

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

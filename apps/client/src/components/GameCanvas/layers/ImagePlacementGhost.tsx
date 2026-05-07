import { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import { useImage } from '../useImage';
import { computeInitialImageDimensions, loadImageNaturalSize } from '../imageDimensions';

interface Props {
  /** The Konva.Stage ref — used to track pointer position layout-independently. */
  stage: Konva.Stage | null;
  /** Signed asset URL (already resolved by the caller from pendingImageAssetId). */
  assetUrl: string;
  /** gridSize from current scene — passed through to dimension clamp. */
  gridSize: number;
}

/**
 * Sess 8.5 — translucent preview of the pending image at the cursor location.
 *
 * Visible while the canvas image tool is in "asset picked, awaiting placement
 * click" state. Replaces a bare crosshair (which gave the user no idea about
 * footprint) with a true-to-scale ghost that follows the cursor. Click-to-place
 * commits via the existing useToolHandlers.placeImageAtCoords flow; this
 * component is purely visual and does not handle clicks.
 *
 * Implementation notes:
 *  - Uses scene-coords (after un-applying stage scale + position) so the ghost
 *    matches the canvas grid even when the user has zoomed/panned.
 *  - Hides itself when the cursor leaves the stage to avoid stale visuals.
 *  - When the asset image is still loading, falls back to a hatched rect of
 *    the computed bbox so the user still sees the footprint shape.
 */
export default function ImagePlacementGhost({ stage, assetUrl, gridSize }: Props): JSX.Element | null {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const image = useImage(assetUrl);

  // Resolve natural dimensions once per assetUrl.
  useEffect(() => {
    let cancelled = false;
    void loadImageNaturalSize(assetUrl).then((natural) => {
      if (!cancelled) setSize(computeInitialImageDimensions(natural, gridSize));
    });
    return () => { cancelled = true; };
  }, [assetUrl, gridSize]);

  // Track pointer in scene coords.
  useEffect(() => {
    if (!stage) return;
    function onMove(): void {
      if (!stage) return;
      const scale = stage.scaleX();
      const pos = stage.position();
      const ptr = stage.getPointerPosition();
      if (!ptr) return;
      setCursor({ x: (ptr.x - pos.x) / scale, y: (ptr.y - pos.y) / scale });
    }
    function onLeave(): void { setCursor(null); }
    stage.on('mousemove.placementghost', onMove);
    stage.on('mouseleave.placementghost', onLeave);
    return () => {
      stage.off('mousemove.placementghost');
      stage.off('mouseleave.placementghost');
    };
  }, [stage]);

  if (!cursor || !size) return null;

  // Center the ghost on the cursor — matches placeImageAtCoords offset.
  const x = cursor.x - size.w / 2;
  const y = cursor.y - size.h / 2;

  return (
    <Layer listening={false}>
      <Group x={x} y={y}>
        {image ? (
          <KonvaImage image={image} width={size.w} height={size.h} opacity={0.55} />
        ) : (
          <Rect width={size.w} height={size.h} fill="#7c5cff" opacity={0.18} />
        )}
        <Rect
          width={size.w}
          height={size.h}
          stroke="#7c5cff"
          strokeWidth={2}
          dash={[6, 4]}
          fill="transparent"
        />
      </Group>
    </Layer>
  );
}

import { useMemo } from 'react';
import { Layer, Rect } from 'react-konva';
import type { Role } from '@vtt/shared';
import { isCellHidden } from '../fogMask';

interface FogOfWarLayerProps {
  fogMaskBase64: string | null;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  myRole: Role;
  /** Theme-aware FoW opacity for non-GM viewers (dark: 0.5, light: 0.7). Default 0.7. */
  fowAlpha?: number;
}

/**
 * Top layer (Ф3.3) — algorithm A4 trigger A. Renders the persistent
 * `Scene.fogMaskBase64` as semi-opaque cells. The matrix itself is mutated by
 * `applyFogDiff` in the scene slice when the server emits `fog:mask-diff`,
 * so this layer simply re-reads the current mask each render.
 *
 * Per-viewer Bresenham overlay (A4 trigger Б) is roadmap §3.10 — server has
 * to extend `SceneUpdatedPayload` with a per-viewer matrix; until then A6
 * already filters out tokens behind blockers from the projected DTO.
 *
 * GM sees the fog at lower opacity (0.55) so they can still place tokens in
 * hidden zones; players see it fully opaque per Ф3.3.3.
 */
export default function FogOfWarLayer({
  fogMaskBase64,
  gridSize,
  gridWidth,
  gridHeight,
  myRole,
  fowAlpha = 0.7,
}: FogOfWarLayerProps): JSX.Element {
  const opacity = myRole === 'GM' ? 0.55 : fowAlpha;

  const hiddenCells = useMemo<{ x: number; y: number }[]>(() => {
    if (!fogMaskBase64) return [];
    const out: { x: number; y: number }[] = [];
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        if (isCellHidden(fogMaskBase64, gridWidth, gridHeight, x, y)) {
          out.push({ x, y });
        }
      }
    }
    return out;
  }, [fogMaskBase64, gridWidth, gridHeight]);

  return (
    <Layer listening={false}>
      {hiddenCells.map((c) => (
        <Rect
          key={`fog-${c.x}-${c.y}`}
          x={c.x * gridSize}
          y={c.y * gridSize}
          width={gridSize}
          height={gridSize}
          fill="#000"
          opacity={opacity}
        />
      ))}
    </Layer>
  );
}

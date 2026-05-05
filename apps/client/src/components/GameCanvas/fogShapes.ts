import type { FogShape } from '@vtt/shared';

/**
 * Pixel-precise fog-of-war composite renderer (Ф3.3, shape-list model).
 *
 * Composes a list of `FogShape` rectangles in `createdAt` ASC order onto an
 * offscreen canvas: `hide` paints opaque black; `reveal` cuts a hole via
 * `globalCompositeOperation = 'destination-out'`. The resulting canvas is
 * consumed by `FogOfWarLayer` as a single `Konva.Image`, so the fog renders
 * seam-free regardless of the shape count.
 *
 * The caller decides display opacity (GM gets a slider; players see full).
 */
export function renderFogToCanvas(
  shapes: FogShape[],
  width: number,
  height: number,
  target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = target ?? document.createElement('canvas');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  if (!shapes.length || width <= 0 || height <= 0) return canvas;

  const ordered = [...shapes].sort((a, b) => a.createdAt - b.createdAt);
  ctx.fillStyle = '#000';
  for (const s of ordered) {
    if (s.mode === 'hide') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(s.x, s.y, s.w, s.h);
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Tests whether a point is inside the (post-composition) hidden region. */
export function isPointHidden(
  shapes: FogShape[],
  x: number,
  y: number,
): boolean {
  let hidden = false;
  const ordered = [...shapes].sort((a, b) => a.createdAt - b.createdAt);
  for (const s of ordered) {
    if (x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h) continue;
    hidden = s.mode === 'hide';
  }
  return hidden;
}

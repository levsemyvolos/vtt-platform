import type { FogShape, FogBitmap } from '@vtt/shared';

/**
 * Pixel-precise fog-of-war composite renderer (Ф3.3, shape-list model).
 *
 * Composes a list of `FogShape` rectangles in `createdAt` ASC order onto an
 * offscreen canvas: `hide` paints opaque black; `reveal` cuts a hole via
 * `globalCompositeOperation = 'destination-out'`. The resulting canvas is
 * consumed by `FogOfWarLayer` as a single `Konva.Image`, so the fog renders
 * seam-free regardless of the shape count.
 *
 * Sess 11 — when `bitmap` is provided, it is drawn first as the base layer
 * (output of an earlier compaction). Subsequent shapes are composited on top,
 * preserving the same hide/reveal semantics. Stale rendering after a bitmap
 * push is impossible because the GM client filters consumed shapes locally
 * before calling this function.
 *
 * The caller decides display opacity (GM gets a slider; players see full).
 */
export function renderFogToCanvas(
  shapes: FogShape[],
  width: number,
  height: number,
  target?: HTMLCanvasElement,
  bitmap?: FogBitmap | null,
  bitmapImage?: HTMLImageElement | null,
): HTMLCanvasElement {
  const canvas = target ?? document.createElement('canvas');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return canvas;

  drawBitmapBase(ctx, width, height, bitmap ?? null, bitmapImage ?? null);
  paintShapes(ctx, shapes);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Sess 11 — Stage 1: the compacted bitmap base layer. The image is
 *  resampled to scene-coord dimensions if its native size differs from
 *  (width, height) — for example when the scene was downscaled past
 *  FOG_BITMAP_MAX_DIM during compaction. */
function drawBitmapBase(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bitmap: FogBitmap | null,
  bitmapImage: HTMLImageElement | null,
): void {
  if (!bitmap || !bitmapImage || !bitmapImage.complete || bitmapImage.naturalWidth <= 0) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bitmapImage, 0, 0, width, height);
}

/** Sess 11 — Stage 2: post-compact shapes overlaid on top of the optional
 *  bitmap base. `reveal` shapes correctly cut holes through both the bitmap
 *  base AND any preceding `hide` shapes via `destination-out` compositing. */
function paintShapes(ctx: CanvasRenderingContext2D, shapes: FogShape[]): void {
  if (shapes.length === 0) return;
  const ordered = [...shapes].sort((a, b) => a.createdAt - b.createdAt);
  ctx.fillStyle = '#000';
  for (const s of ordered) {
    ctx.globalCompositeOperation = s.mode === 'hide' ? 'source-over' : 'destination-out';
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
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

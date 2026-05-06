import type { SceneObject } from '@vtt/shared';

export interface SelectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute a selection bounding-box for any SceneObject type.
 *
 * - image: exact pixel dimensions with 2px padding on each side.
 * - text:  estimated from character count × fontSize (imprecise for non-Latin / emoji,
 *          but acceptable for visual selection feedback).
 * - stroke: min/max over the flat points array + strokeWidth padding.
 *
 * Coordinates are relative to the Group's origin (x=0, y=0 of the Group),
 * so negative x/y values mean the rect extends before the origin.
 */
export function computeSelectionBox(object: SceneObject): SelectionBox {
  if (object.type === 'image') {
    return { x: -2, y: -2, w: object.width + 4, h: object.height + 4 };
  }

  if (object.type === 'text') {
    const width = Math.max(20, object.text.length * object.fontSize * 0.55);
    const height = object.fontSize * 1.2;
    return { x: -4, y: -4, w: width + 8, h: height + 8 };
  }

  // stroke
  const pts = object.points;
  if (pts.length < 2) return { x: -4, y: -4, w: 8, h: 8 };
  let minX = pts[0]!;
  let maxX = pts[0]!;
  let minY = pts[1]!;
  let maxY = pts[1]!;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const padding = (object.strokeWidth ?? 2) + 4;
  return {
    x: minX - padding,
    y: minY - padding,
    w: (maxX - minX) + padding * 2,
    h: (maxY - minY) + padding * 2,
  };
}

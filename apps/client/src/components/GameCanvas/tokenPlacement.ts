import type { TokenPublicDTO } from '@vtt/shared';

/**
 * Compute the spawn position for a new token. Starts at scene center (snapped
 * to the nearest grid-aligned cell) and walks across columns, then rows, until
 * an unoccupied pixel is found. Wraps to the next row when reaching the right
 * edge of the scene. Falls back to center if the entire scene is saturated.
 *
 * Collision check is exact-equality on (x, y) — tokens occupy one cell each.
 */
export function findFreeTokenSpawn(args: {
  existingTokens: ReadonlyArray<Pick<TokenPublicDTO, 'x' | 'y'>>;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
}): { x: number; y: number } {
  const { existingTokens, gridSize, gridWidth, gridHeight } = args;

  const centerX = Math.floor((gridWidth * gridSize) / 2);
  const centerY = Math.floor((gridHeight * gridSize) / 2);
  // Snap to nearest grid-aligned cell so the stagger walks along whole cells.
  const startX = Math.round(centerX / gridSize) * gridSize;
  const startY = Math.round(centerY / gridSize) * gridSize;

  const occupied = new Set(existingTokens.map((t) => `${t.x},${t.y}`));

  if (!occupied.has(`${startX},${startY}`)) return { x: startX, y: startY };

  // Row-major scan over every grid cell. Start at top-left (0,0) and return
  // the first unoccupied cell. Simple and predictable.
  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const x = col * gridSize;
      const y = row * gridSize;
      if (!occupied.has(`${x},${y}`)) return { x, y };
    }
  }

  // Saturation fallback — all cells taken; stack on center rather than going out of bounds.
  return { x: startX, y: startY };
}

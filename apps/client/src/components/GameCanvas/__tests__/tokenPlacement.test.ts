import { describe, it, expect } from 'vitest';
import { findFreeTokenSpawn } from '../tokenPlacement';

const BASE = { gridSize: 70, gridWidth: 10, gridHeight: 10 };
// center = floor(10 * 70 / 2) = 350; snapped = round(350 / 70) * 70 = 5 * 70 = 350
const CENTER = { x: 350, y: 350 };

describe('findFreeTokenSpawn', () => {
  it('returns center for an empty scene', () => {
    const result = findFreeTokenSpawn({ ...BASE, existingTokens: [] });
    expect(result).toEqual(CENTER);
  });

  it('shifts right by one cell when center is occupied', () => {
    const result = findFreeTokenSpawn({
      ...BASE,
      existingTokens: [{ x: CENTER.x, y: CENTER.y }],
    });
    // Row-major scan finds (0, 0) first, since center (350,350) is column 5, row 5
    // and there are free cells before it.
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('skips all occupied top-left cells and returns next free one', () => {
    // Fill (0,0) and center — next free should be (70, 0)
    const result = findFreeTokenSpawn({
      ...BASE,
      existingTokens: [
        { x: 0, y: 0 },
        { x: CENTER.x, y: CENTER.y },
      ],
    });
    expect(result).toEqual({ x: 70, y: 0 });
  });

  it('wraps to next row when top row is fully occupied', () => {
    // Fill entire first row (col 0..9, row 0) and center
    const existingTokens = Array.from({ length: BASE.gridWidth }, (_, col) => ({
      x: col * BASE.gridSize,
      y: 0,
    }));
    existingTokens.push({ x: CENTER.x, y: CENTER.y });
    const result = findFreeTokenSpawn({ ...BASE, existingTokens });
    // First free cell in row 1
    expect(result).toEqual({ x: 0, y: BASE.gridSize });
  });

  it('snaps non-grid-aligned center to nearest grid cell', () => {
    // gridWidth=9, gridSize=70 → center = floor(9*70/2)=315, snapped = round(315/70)*70 = round(4.5)*70 = 5*70 = 350
    const args = { gridSize: 70, gridWidth: 9, gridHeight: 9, existingTokens: [] };
    const result = findFreeTokenSpawn(args);
    expect(result.x % 70).toBe(0);
    expect(result.y % 70).toBe(0);
  });

  it('snaps odd-cell-count grid (gridWidth=7) to nearest grid cell', () => {
    // center = floor(7*70/2) = floor(245) = 245; snapped = round(245/70)*70 = round(3.5)*70 = 4*70 = 280
    const args = { gridSize: 70, gridWidth: 7, gridHeight: 7, existingTokens: [] };
    const result = findFreeTokenSpawn(args);
    expect(result.x % 70).toBe(0);
    expect(result.y % 70).toBe(0);
  });

  it('falls back to center when entire scene is saturated', () => {
    const { gridSize, gridWidth, gridHeight } = BASE;
    const existingTokens = Array.from({ length: gridWidth * gridHeight }, (_, i) => ({
      x: (i % gridWidth) * gridSize,
      y: Math.floor(i / gridWidth) * gridSize,
    }));
    const result = findFreeTokenSpawn({ ...BASE, existingTokens });
    expect(result).toEqual(CENTER);
  });
});

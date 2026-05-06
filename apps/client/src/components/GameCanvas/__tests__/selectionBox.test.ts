import { describe, it, expect } from 'vitest';
import { computeSelectionBox } from '../selectionBox';
import type { SceneObject } from '@vtt/shared';

describe('computeSelectionBox', () => {
  it('image: adds 2px padding on all sides', () => {
    const obj: SceneObject = {
      id: 'img-1',
      type: 'image',
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 0,
      assetId: 'a1',
      width: 100,
      height: 80,
      rotation: 0,
      layer: 'tile',
      visibility: 'all',
    };
    const box = computeSelectionBox(obj);
    expect(box).toEqual({ x: -2, y: -2, w: 104, h: 84 });
  });

  it('text: estimates bounding box from text length and fontSize', () => {
    const obj: SceneObject = {
      id: 'txt-1',
      type: 'text',
      userId: 'u1',
      x: 10,
      y: 10,
      zIndex: 1,
      text: 'Hello',
      fontSize: 20,
      color: '#fff',
      layer: 'overlay',
      visibility: 'all',
    };
    const box = computeSelectionBox(obj);
    // width = 5 * 20 * 0.55 = 55; height = 20 * 1.2 = 24
    // x=-4, y=-4, w=55+8=63, h=24+8=32
    expect(box.x).toBe(-4);
    expect(box.y).toBe(-4);
    expect(box.w).toBeCloseTo(63);
    expect(box.h).toBeCloseTo(32);
  });

  it('text: enforces minimum width of 20 for empty/very short text', () => {
    const obj: SceneObject = {
      id: 'txt-2',
      type: 'text',
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 1,
      text: '',
      fontSize: 14,
      color: '#fff',
      layer: 'overlay',
      visibility: 'all',
    };
    const box = computeSelectionBox(obj);
    // text.length=0 → Math.max(20, 0) = 20
    expect(box.w).toBe(28); // 20 + 8 padding
  });

  it('stroke: computes min/max bbox from points array with strokeWidth padding', () => {
    const obj: SceneObject = {
      id: 'str-1',
      type: 'stroke',
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 2,
      points: [10, 20, 50, 80, 30, 40],
      color: '#f00',
      strokeWidth: 4,
      layer: 'overlay',
      visibility: 'all',
    };
    // minX=10, maxX=50, minY=20, maxY=80
    // padding = 4 + 4 = 8
    // x = 10-8=2, y=20-8=12, w=(50-10)+16=56, h=(80-20)+16=76
    const box = computeSelectionBox(obj);
    expect(box.x).toBe(2);
    expect(box.y).toBe(12);
    expect(box.w).toBe(56);
    expect(box.h).toBe(76);
  });

  it('stroke: uses provided strokeWidth for padding calculation', () => {
    const obj: SceneObject = {
      id: 'str-2',
      type: 'stroke',
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 2,
      points: [0, 0, 100, 100],
      color: '#00f',
      strokeWidth: 2,
      layer: 'overlay',
      visibility: 'all',
    };
    // padding = 2+4 = 6
    // x=0-6=-6, y=0-6=-6, w=100+12=112, h=100+12=112
    const box = computeSelectionBox(obj);
    expect(box.x).toBe(-6);
    expect(box.y).toBe(-6);
    expect(box.w).toBe(112);
    expect(box.h).toBe(112);
  });

  it('stroke: returns minimal box for degenerate (< 2 points) array', () => {
    const obj: SceneObject = {
      id: 'str-3',
      type: 'stroke',
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 2,
      points: [],
      color: '#0f0',
      strokeWidth: 2,
      layer: 'overlay',
      visibility: 'all',
    };
    const box = computeSelectionBox(obj);
    expect(box).toEqual({ x: -4, y: -4, w: 8, h: 8 });
  });
});

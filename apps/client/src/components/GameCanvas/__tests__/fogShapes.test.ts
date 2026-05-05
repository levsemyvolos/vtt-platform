import { describe, it, expect } from 'vitest';
import type { FogShape } from '@vtt/shared';
import { isPointHidden } from '../fogShapes';

function shape(overrides: Partial<FogShape>): FogShape {
  return {
    id: 's',
    x: 0, y: 0, w: 10, h: 10,
    mode: 'hide',
    createdAt: 0,
    ...overrides,
  };
}

describe('fogShapes composition', () => {
  it('treats empty shape list as fully revealed', () => {
    expect(isPointHidden([], 5, 5)).toBe(false);
  });

  it('hide shape covers points inside the rect', () => {
    const s = shape({ x: 0, y: 0, w: 100, h: 100, mode: 'hide', createdAt: 1 });
    expect(isPointHidden([s], 50, 50)).toBe(true);
    expect(isPointHidden([s], 150, 50)).toBe(false);
  });

  it('reveal shape cuts a hole from a prior hide', () => {
    const hide = shape({ id: 'a', x: 0, y: 0, w: 100, h: 100, mode: 'hide', createdAt: 1 });
    const reveal = shape({ id: 'b', x: 25, y: 25, w: 50, h: 50, mode: 'reveal', createdAt: 2 });
    expect(isPointHidden([hide, reveal], 50, 50)).toBe(false);
    expect(isPointHidden([hide, reveal], 10, 10)).toBe(true);
  });

  it('later hide on top of reveal restores opacity', () => {
    const hide = shape({ id: 'a', x: 0, y: 0, w: 100, h: 100, mode: 'hide', createdAt: 1 });
    const reveal = shape({ id: 'b', x: 0, y: 0, w: 100, h: 100, mode: 'reveal', createdAt: 2 });
    const hide2 = shape({ id: 'c', x: 40, y: 40, w: 20, h: 20, mode: 'hide', createdAt: 3 });
    expect(isPointHidden([hide, reveal, hide2], 50, 50)).toBe(true);
    expect(isPointHidden([hide, reveal, hide2], 10, 10)).toBe(false);
  });

  it('orders shapes by createdAt regardless of input order', () => {
    const hide = shape({ id: 'a', x: 0, y: 0, w: 50, h: 50, mode: 'hide', createdAt: 10 });
    const reveal = shape({ id: 'b', x: 0, y: 0, w: 50, h: 50, mode: 'reveal', createdAt: 20 });
    expect(isPointHidden([reveal, hide], 25, 25)).toBe(false);
  });
});

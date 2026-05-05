import { describe, it, expect } from 'vitest';
import { computeBackgroundGeometry } from '../backgroundLayout';

const SCENE_W = 1000;
const SCENE_H = 600;

describe('computeBackgroundGeometry', () => {
  it('stretch → returns scene size regardless of image aspect', () => {
    const geom = computeBackgroundGeometry({
      naturalWidth: 1920,
      naturalHeight: 1080,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'stretch',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(geom.width).toBe(SCENE_W);
    expect(geom.height).toBe(SCENE_H);
    expect(geom.x).toBe(0);
    expect(geom.y).toBe(0);
  });

  it('cover wider image → height matches scene, width overflows; result centered', () => {
    // Image: 1920×1080 (aspect ~1.78), scene: 1000×600 (aspect ~1.67)
    // imageAspect > sceneAspect → baseH = sceneH, baseW = sceneH * imageAspect
    const imageAspect = 1920 / 1080;
    const geom = computeBackgroundGeometry({
      naturalWidth: 1920,
      naturalHeight: 1080,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const expectedW = SCENE_H * imageAspect;
    const expectedH = SCENE_H;
    expect(geom.height).toBeCloseTo(expectedH, 5);
    expect(geom.width).toBeCloseTo(expectedW, 5);
    // Must overflow: width > scene width
    expect(geom.width).toBeGreaterThan(SCENE_W);
    // Centered
    expect(geom.x).toBeCloseTo((SCENE_W - expectedW) / 2, 5);
    expect(geom.y).toBeCloseTo(0, 5);
  });

  it('cover taller image → width matches scene, height overflows; result centered', () => {
    // Image: 600×1000 (portrait, imageAspect=0.6 < sceneAspect=1.67)
    // → baseW = sceneW, baseH = sceneW / imageAspect
    const imageAspect = 600 / 1000;
    const geom = computeBackgroundGeometry({
      naturalWidth: 600,
      naturalHeight: 1000,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const expectedW = SCENE_W;
    const expectedH = SCENE_W / imageAspect;
    expect(geom.width).toBeCloseTo(expectedW, 5);
    expect(geom.height).toBeCloseTo(expectedH, 5);
    expect(geom.height).toBeGreaterThan(SCENE_H);
    expect(geom.x).toBeCloseTo(0, 5);
    expect(geom.y).toBeCloseTo((SCENE_H - expectedH) / 2, 5);
  });

  it('contain wider image → width matches scene, height letterboxed', () => {
    // Image: 1920×1080, imageAspect ~1.78 > sceneAspect 1.67
    // → baseW = sceneW, baseH = sceneW / imageAspect
    const imageAspect = 1920 / 1080;
    const geom = computeBackgroundGeometry({
      naturalWidth: 1920,
      naturalHeight: 1080,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'contain',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const expectedW = SCENE_W;
    const expectedH = SCENE_W / imageAspect;
    expect(geom.width).toBeCloseTo(expectedW, 5);
    expect(geom.height).toBeCloseTo(expectedH, 5);
    // Must be letterboxed: height < scene height
    expect(geom.height).toBeLessThan(SCENE_H);
    expect(geom.x).toBeCloseTo(0, 5);
    expect(geom.y).toBeCloseTo((SCENE_H - expectedH) / 2, 5);
  });

  it('contain taller image → height matches scene, width letterboxed', () => {
    // Image: 600×1000 (portrait, imageAspect=0.6 < sceneAspect=1.67)
    // → baseH = sceneH, baseW = sceneH * imageAspect
    const imageAspect = 600 / 1000;
    const geom = computeBackgroundGeometry({
      naturalWidth: 600,
      naturalHeight: 1000,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'contain',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const expectedH = SCENE_H;
    const expectedW = SCENE_H * imageAspect;
    expect(geom.height).toBeCloseTo(expectedH, 5);
    expect(geom.width).toBeCloseTo(expectedW, 5);
    expect(geom.width).toBeLessThan(SCENE_W);
    expect(geom.x).toBeCloseTo((SCENE_W - expectedW) / 2, 5);
    expect(geom.y).toBeCloseTo(0, 5);
  });

  it('scale 2.0 → final size doubled, still centered', () => {
    const geom = computeBackgroundGeometry({
      naturalWidth: SCENE_W,
      naturalHeight: SCENE_H,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'stretch',
      scale: 2,
      offsetX: 0,
      offsetY: 0,
    });
    expect(geom.width).toBeCloseTo(SCENE_W * 2, 5);
    expect(geom.height).toBeCloseTo(SCENE_H * 2, 5);
    // Centered: (1000 - 2000) / 2 = -500
    expect(geom.x).toBeCloseTo(-SCENE_W / 2, 5);
    expect(geom.y).toBeCloseTo(-SCENE_H / 2, 5);
  });

  it('non-zero offsetX/Y shifts position', () => {
    const geom = computeBackgroundGeometry({
      naturalWidth: SCENE_W,
      naturalHeight: SCENE_H,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'stretch',
      scale: 1,
      offsetX: 50,
      offsetY: -30,
    });
    expect(geom.x).toBeCloseTo(50, 5);
    expect(geom.y).toBeCloseTo(-30, 5);
  });

  it('naturalWidth=0 (image not loaded) → falls back to scene size', () => {
    const geom = computeBackgroundGeometry({
      naturalWidth: 0,
      naturalHeight: 0,
      sceneWidth: SCENE_W,
      sceneHeight: SCENE_H,
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(geom.width).toBe(SCENE_W);
    expect(geom.height).toBe(SCENE_H);
    expect(geom.x).toBe(0);
    expect(geom.y).toBe(0);
  });
});

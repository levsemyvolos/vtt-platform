import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneAnnotationService } from '../../src/services/SceneAnnotationService.js';
import type { SceneAnnotations } from '@vtt/shared';

const SCENE_ID = 'scene-1';
const GRID_SIZE = 50;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;

function makeAnnotationsWithImage(): SceneAnnotations {
  return {
    strokes: [],
    texts: [],
    images: [{ id: 'img-1', userId: 'u1', x: 10, y: 10, assetId: 'asset-1', width: 100, height: 100, rotation: 0 }],
    objects: [{ id: 'img-1', type: 'image', userId: 'u1', x: 10, y: 10, zIndex: 0, assetId: 'asset-1', width: 100, height: 100, rotation: 0 }],
  };
}

function makeDrawService(annotations: SceneAnnotations = makeAnnotationsWithImage()) {
  // Deep clone to avoid mutation between tests
  const data = JSON.parse(JSON.stringify(annotations)) as SceneAnnotations;
  return {
    getAnnotations: vi.fn().mockResolvedValue(data),
    persist: vi.fn().mockResolvedValue(undefined),
  };
}

function makePrisma(overrides?: Partial<{ gridSize: number; gridWidth: number; gridHeight: number }>) {
  return {
    scene: {
      findUnique: vi.fn().mockResolvedValue({
        id: SCENE_ID,
        gridSize: overrides?.gridSize ?? GRID_SIZE,
        gridWidth: overrides?.gridWidth ?? GRID_WIDTH,
        gridHeight: overrides?.gridHeight ?? GRID_HEIGHT,
      }),
    },
  };
}

describe('SceneAnnotationService.transformObject — RBAC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 403 when role is not GM', async () => {
    const svc = new SceneAnnotationService(makePrisma() as never, makeDrawService() as never);
    await expect(
      svc.transformObject(SCENE_ID, 'img-1', 'Player', { width: 100, height: 100, rotation: 0 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('SceneAnnotationService.transformObject — 404 for missing id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 404 when objectId does not exist', async () => {
    const svc = new SceneAnnotationService(makePrisma() as never, makeDrawService() as never);
    await expect(
      svc.transformObject(SCENE_ID, 'nonexistent', 'GM', { width: 100, height: 100, rotation: 0 }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('SceneAnnotationService.transformObject — dimension clamping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clamps width/height to minimum gridSize (1 cell)', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 10, height: 5, rotation: 0 });
    expect(result.images[0]?.width).toBe(GRID_SIZE);
    expect(result.images[0]?.height).toBe(GRID_SIZE);
    expect(result.objects?.[0]?.width).toBe(GRID_SIZE);
    expect(result.objects?.[0]?.height).toBe(GRID_SIZE);
  });

  it('clamps width/height to maximum gridWidth*gridSize / gridHeight*gridSize', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const maxW = GRID_WIDTH * GRID_SIZE;
    const maxH = GRID_HEIGHT * GRID_SIZE;
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 99999, height: 99999, rotation: 0 });
    expect(result.images[0]?.width).toBe(maxW);
    expect(result.images[0]?.height).toBe(maxH);
  });

  it('passes through valid in-range dimensions unchanged', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 200, height: 150, rotation: 0 });
    expect(result.images[0]?.width).toBe(200);
    expect(result.images[0]?.height).toBe(150);
  });
});

describe('SceneAnnotationService.transformObject — rotation normalization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes negative rotation: -15 → 345', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 100, height: 100, rotation: -15 });
    expect(result.images[0]?.rotation).toBe(345);
  });

  it('normalizes rotation > 360: 370 → 10', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 100, height: 100, rotation: 370 });
    expect(result.images[0]?.rotation).toBe(10);
  });

  it('normalizes 0 rotation to 0', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 100, height: 100, rotation: 0 });
    expect(result.images[0]?.rotation).toBe(0);
  });

  it('normalizes 360 rotation to 0', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 100, height: 100, rotation: 360 });
    expect(result.images[0]?.rotation).toBe(0);
  });
});

describe('SceneAnnotationService.transformObject — mirror update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates both images[] and objects[] entries', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    const result = await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 200, height: 150, rotation: 90 });
    const img = result.images.find((i) => i.id === 'img-1');
    const obj = (result.objects ?? []).find((o) => o.id === 'img-1');
    expect(img?.width).toBe(200);
    expect(img?.rotation).toBe(90);
    expect(obj?.width).toBe(200);
    expect(obj?.rotation).toBe(90);
  });

  it('persists after transform', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);
    await svc.transformObject(SCENE_ID, 'img-1', 'GM', { width: 200, height: 150, rotation: 30 });
    expect(drawSvc.persist).toHaveBeenCalledOnce();
  });
});

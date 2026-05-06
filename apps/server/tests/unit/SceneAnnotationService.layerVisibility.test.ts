import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneAnnotationService } from '../../src/services/SceneAnnotationService.js';
import type { SceneAnnotations } from '@vtt/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCENE_ID = 'scene-lv';
const USER_ID = 'user-gm';

function makeAnnotationsWithImage(): SceneAnnotations {
  return {
    strokes: [],
    texts: [],
    images: [
      { id: 'img-1', userId: USER_ID, x: 10, y: 10, assetId: 'asset-1', width: 100, height: 100, layer: 'tile', visibility: 'all' },
    ],
    objects: [
      { id: 'img-1', type: 'image', userId: USER_ID, x: 10, y: 10, zIndex: 0, assetId: 'asset-1', width: 100, height: 100, layer: 'tile', visibility: 'all' },
    ],
  };
}

function makeAnnotationsWithText(): SceneAnnotations {
  return {
    strokes: [],
    texts: [
      { id: 'txt-1', userId: USER_ID, x: 5, y: 5, text: 'Hello', fontSize: 16, color: '#fff', layer: 'overlay', visibility: 'all' },
    ],
    images: [],
    objects: [
      { id: 'txt-1', type: 'text', userId: USER_ID, x: 5, y: 5, zIndex: 0, text: 'Hello', fontSize: 16, color: '#fff', layer: 'overlay', visibility: 'all' },
    ],
  };
}

function makeAnnotationsWithStroke(): SceneAnnotations {
  return {
    strokes: [
      { strokeId: 'stroke-1', userId: USER_ID, points: [0, 0, 10, 10], color: '#f00', width: 2, layer: 'overlay', visibility: 'all' },
    ],
    texts: [],
    images: [],
    objects: [
      { id: 'stroke-1', type: 'stroke', userId: USER_ID, x: 0, y: 0, zIndex: 0, points: [0, 0, 10, 10], color: '#f00', strokeWidth: 2, layer: 'overlay', visibility: 'all' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeDrawService(annotations: SceneAnnotations) {
  const data = JSON.parse(JSON.stringify(annotations)) as SceneAnnotations;
  return {
    getAnnotations: vi.fn().mockResolvedValue(data),
    persist: vi.fn().mockImplementation((_sceneId: string, updated: SceneAnnotations) => {
      Object.assign(data, updated);
      return Promise.resolve();
    }),
  };
}

function makePrisma() {
  return {
    scene: {
      findUnique: vi.fn().mockResolvedValue({ id: SCENE_ID, gridSize: 50, gridWidth: 20, gridHeight: 20 }),
    },
  };
}

// ---------------------------------------------------------------------------
// setObjectLayer
// ---------------------------------------------------------------------------

describe('SceneAnnotationService.setObjectLayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flips layer to overlay on objects[] entry (image)', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectLayer(SCENE_ID, 'img-1', 'GM', 'overlay');
    const obj = (result.objects ?? []).find((o) => o.id === 'img-1');
    expect(obj?.layer).toBe('overlay');
  });

  it('mirrors layer to images[] entry', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectLayer(SCENE_ID, 'img-1', 'GM', 'overlay');
    const img = result.images.find((i) => i.id === 'img-1');
    expect(img?.layer).toBe('overlay');
  });

  it('flips layer on text objects[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithText());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectLayer(SCENE_ID, 'txt-1', 'GM', 'tile');
    const obj = (result.objects ?? []).find((o) => o.id === 'txt-1');
    expect(obj?.layer).toBe('tile');
  });

  it('mirrors layer to texts[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithText());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectLayer(SCENE_ID, 'txt-1', 'GM', 'tile');
    const text = result.texts.find((t) => t.id === 'txt-1');
    expect(text?.layer).toBe('tile');
  });

  it('mirrors layer to strokes[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithStroke());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectLayer(SCENE_ID, 'stroke-1', 'GM', 'tile');
    const stroke = result.strokes.find((s) => s.strokeId === 'stroke-1');
    expect(stroke?.layer).toBe('tile');
  });

  it('throws 404 when objectId does not exist', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.setObjectLayer(SCENE_ID, 'nonexistent', 'GM', 'overlay'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when role is not GM', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.setObjectLayer(SCENE_ID, 'img-1', 'Player', 'overlay'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('persists after layer change', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await svc.setObjectLayer(SCENE_ID, 'img-1', 'GM', 'overlay');
    expect(drawSvc.persist).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// setObjectVisibility
// ---------------------------------------------------------------------------

describe('SceneAnnotationService.setObjectVisibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flips visibility to gm-only on objects[] entry', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectVisibility(SCENE_ID, 'img-1', 'GM', 'gm-only');
    const obj = (result.objects ?? []).find((o) => o.id === 'img-1');
    expect(obj?.visibility).toBe('gm-only');
  });

  it('mirrors visibility to images[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectVisibility(SCENE_ID, 'img-1', 'GM', 'gm-only');
    const img = result.images.find((i) => i.id === 'img-1');
    expect(img?.visibility).toBe('gm-only');
  });

  it('flips visibility back to all', async () => {
    const base = makeAnnotationsWithImage();
    base.objects![0]!.visibility = 'gm-only';
    base.images[0]!.visibility = 'gm-only';

    const drawSvc = makeDrawService(base);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectVisibility(SCENE_ID, 'img-1', 'GM', 'all');
    const obj = (result.objects ?? []).find((o) => o.id === 'img-1');
    expect(obj?.visibility).toBe('all');
  });

  it('mirrors visibility to texts[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithText());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectVisibility(SCENE_ID, 'txt-1', 'GM', 'gm-only');
    const text = result.texts.find((t) => t.id === 'txt-1');
    expect(text?.visibility).toBe('gm-only');
  });

  it('mirrors visibility to strokes[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithStroke());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setObjectVisibility(SCENE_ID, 'stroke-1', 'GM', 'gm-only');
    const stroke = result.strokes.find((s) => s.strokeId === 'stroke-1');
    expect(stroke?.visibility).toBe('gm-only');
  });

  it('throws 404 when objectId does not exist', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.setObjectVisibility(SCENE_ID, 'nonexistent', 'GM', 'gm-only'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when role is not GM', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.setObjectVisibility(SCENE_ID, 'img-1', 'Player', 'gm-only'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('persists after visibility change', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await svc.setObjectVisibility(SCENE_ID, 'img-1', 'GM', 'gm-only');
    expect(drawSvc.persist).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// addImage / addText defaults
// ---------------------------------------------------------------------------

describe('SceneAnnotationService.addImage defaults', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults layer to tile', async () => {
    const empty: SceneAnnotations = { strokes: [], texts: [], images: [], objects: [] };
    const drawSvc = makeDrawService(empty);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.addImage(SCENE_ID, USER_ID, { x: 0, y: 0, assetId: 'asset-x' });
    const obj = (result.objects ?? [])[0];
    expect(obj?.layer).toBe('tile');
  });

  it('defaults visibility to all', async () => {
    const empty: SceneAnnotations = { strokes: [], texts: [], images: [], objects: [] };
    const drawSvc = makeDrawService(empty);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.addImage(SCENE_ID, USER_ID, { x: 0, y: 0, assetId: 'asset-x' });
    const obj = (result.objects ?? [])[0];
    expect(obj?.visibility).toBe('all');
  });

  it('mirrors layer=tile to images[]', async () => {
    const empty: SceneAnnotations = { strokes: [], texts: [], images: [], objects: [] };
    const drawSvc = makeDrawService(empty);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.addImage(SCENE_ID, USER_ID, { x: 0, y: 0, assetId: 'asset-x' });
    expect(result.images[0]?.layer).toBe('tile');
  });
});

describe('SceneAnnotationService.addText defaults', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults layer to overlay', async () => {
    const empty: SceneAnnotations = { strokes: [], texts: [], images: [], objects: [] };
    const drawSvc = makeDrawService(empty);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.addText(SCENE_ID, USER_ID, { x: 0, y: 0, text: 'Hi' });
    const obj = (result.objects ?? [])[0];
    expect(obj?.layer).toBe('overlay');
  });

  it('defaults visibility to all', async () => {
    const empty: SceneAnnotations = { strokes: [], texts: [], images: [], objects: [] };
    const drawSvc = makeDrawService(empty);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.addText(SCENE_ID, USER_ID, { x: 0, y: 0, text: 'Hi' });
    const obj = (result.objects ?? [])[0];
    expect(obj?.visibility).toBe('all');
  });

  it('mirrors layer=overlay to texts[]', async () => {
    const empty: SceneAnnotations = { strokes: [], texts: [], images: [], objects: [] };
    const drawSvc = makeDrawService(empty);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.addText(SCENE_ID, USER_ID, { x: 0, y: 0, text: 'Hi' });
    expect(result.texts[0]?.layer).toBe('overlay');
  });
});

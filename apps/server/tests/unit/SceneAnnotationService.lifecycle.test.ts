import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneAnnotationService } from '../../src/services/SceneAnnotationService.js';
import type { SceneAnnotations } from '@vtt/shared';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SCENE_ID = 'scene-lifecycle';
const USER_ID = 'user-gm';

function makeAnnotationsWithImage(): SceneAnnotations {
  return {
    strokes: [],
    texts: [],
    images: [
      { id: 'img-1', userId: USER_ID, x: 10, y: 10, assetId: 'asset-1', width: 100, height: 100, rotation: 0 },
    ],
    objects: [
      { id: 'img-1', type: 'image', userId: USER_ID, x: 10, y: 10, zIndex: 0, assetId: 'asset-1', width: 100, height: 100, rotation: 0 },
    ],
  };
}

function makeAnnotationsWithThreeObjects(): SceneAnnotations {
  return {
    strokes: [],
    texts: [
      { id: 'txt-1', userId: USER_ID, x: 5, y: 5, text: 'Hello', fontSize: 16, color: '#fff' },
    ],
    images: [
      { id: 'img-2', userId: USER_ID, x: 20, y: 20, assetId: 'asset-2', width: 80, height: 80 },
    ],
    objects: [
      { id: 'txt-1', type: 'text', userId: USER_ID, x: 5, y: 5, zIndex: 0, text: 'Hello', fontSize: 16, color: '#fff' },
      { id: 'img-2', type: 'image', userId: USER_ID, x: 20, y: 20, zIndex: 1, assetId: 'asset-2', width: 80, height: 80 },
      { id: 'stroke-1', type: 'stroke', userId: USER_ID, x: 0, y: 0, zIndex: 2, points: [0, 0, 10, 10], color: '#f00', strokeWidth: 3 },
    ],
  };
}

function makeAnnotationsWithStroke(): SceneAnnotations {
  return {
    strokes: [
      { strokeId: 'stroke-s1', userId: USER_ID, points: [1, 2, 3, 4], color: '#00f', width: 2 },
    ],
    texts: [],
    images: [],
    objects: [
      { id: 'stroke-s1', type: 'stroke', userId: USER_ID, x: 0, y: 0, zIndex: 0, points: [1, 2, 3, 4], color: '#00f', strokeWidth: 2 },
    ],
  };
}

function makeAnnotationsWithText(): SceneAnnotations {
  return {
    strokes: [],
    texts: [
      { id: 'txt-t1', userId: USER_ID, x: 30, y: 40, text: 'World', fontSize: 18, color: '#0f0' },
    ],
    images: [],
    objects: [
      { id: 'txt-t1', type: 'text', userId: USER_ID, x: 30, y: 40, zIndex: 0, text: 'World', fontSize: 18, color: '#0f0' },
    ],
  };
}

function makeAnnotationsWithSingleObject(): SceneAnnotations {
  return {
    strokes: [],
    texts: [],
    images: [
      { id: 'only-img', userId: USER_ID, x: 0, y: 0, assetId: 'asset-only', width: 64, height: 64 },
    ],
    objects: [
      { id: 'only-img', type: 'image', userId: USER_ID, x: 0, y: 0, zIndex: 5, assetId: 'asset-only', width: 64, height: 64 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeDrawService(annotations: SceneAnnotations) {
  // Deep-clone so mutations don't bleed between tests
  const data = JSON.parse(JSON.stringify(annotations)) as SceneAnnotations;
  return {
    getAnnotations: vi.fn().mockResolvedValue(data),
    persist: vi.fn().mockImplementation((_sceneId: string, updated: SceneAnnotations) => {
      // Keep the in-memory data in sync so chained calls work
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
// lockObject
// ---------------------------------------------------------------------------

describe('SceneAnnotationService.lockObject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets locked=true on objects[] entry', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.lockObject(SCENE_ID, 'img-1', 'GM', true);

    const obj = (result.objects ?? []).find((o) => o.id === 'img-1');
    expect(obj?.locked).toBe(true);
  });

  it('mirrors locked=true to images[] entry', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.lockObject(SCENE_ID, 'img-1', 'GM', true);

    const img = result.images.find((i) => i.id === 'img-1');
    expect(img?.locked).toBe(true);
  });

  it('sets locked=false (unlock) on objects[] entry', async () => {
    // Start with a pre-locked annotation
    const base = makeAnnotationsWithImage();
    base.objects![0]!.locked = true;
    base.images[0]!.locked = true;

    const drawSvc = makeDrawService(base);
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.lockObject(SCENE_ID, 'img-1', 'GM', false);
    const obj = (result.objects ?? []).find((o) => o.id === 'img-1');
    expect(obj?.locked).toBe(false);
  });

  it('throws 404 when objectId does not exist', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.lockObject(SCENE_ID, 'nonexistent', 'GM', true),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when role is not GM', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.lockObject(SCENE_ID, 'img-1', 'Player', true),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('persists after locking', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await svc.lockObject(SCENE_ID, 'img-1', 'GM', true);
    expect(drawSvc.persist).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// setZIndex
// ---------------------------------------------------------------------------

describe('SceneAnnotationService.setZIndex', () => {
  beforeEach(() => vi.clearAllMocks());

  it('direction=front sets target zIndex to max(others)+1', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithThreeObjects());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    // txt-1 has zIndex=0; others are 1 and 2. After 'front': should be 3.
    const result = await svc.setZIndex(SCENE_ID, 'txt-1', 'GM', 'front');
    const obj = (result.objects ?? []).find((o) => o.id === 'txt-1');
    expect(obj?.zIndex).toBe(3); // max(1,2)+1
  });

  it('direction=back sets target zIndex to min(others)-1', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithThreeObjects());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    // stroke-1 has zIndex=2; others are 0 and 1. After 'back': should be -1.
    const result = await svc.setZIndex(SCENE_ID, 'stroke-1', 'GM', 'back');
    const obj = (result.objects ?? []).find((o) => o.id === 'stroke-1');
    expect(obj?.zIndex).toBe(-1); // min(0,1)-1
  });

  it('allows negative zIndex without normalization', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithThreeObjects());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const result = await svc.setZIndex(SCENE_ID, 'stroke-1', 'GM', 'back');
    const allZ = (result.objects ?? []).map((o) => o.zIndex);
    expect(Math.min(...allZ)).toBeLessThan(0);
  });

  it('single object edge-case: zIndex is unchanged (no peers)', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithSingleObject());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const before = 5; // makeAnnotationsWithSingleObject zIndex
    const result = await svc.setZIndex(SCENE_ID, 'only-img', 'GM', 'front');
    const obj = (result.objects ?? []).find((o) => o.id === 'only-img');
    // No peers → no-op
    expect(obj?.zIndex).toBe(before);
  });

  it('single object back edge-case: zIndex is unchanged (no peers)', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithSingleObject());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const before = 5;
    const result = await svc.setZIndex(SCENE_ID, 'only-img', 'GM', 'back');
    const obj = (result.objects ?? []).find((o) => o.id === 'only-img');
    expect(obj?.zIndex).toBe(before);
  });

  it('throws 404 when objectId does not exist', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.setZIndex(SCENE_ID, 'ghost-id', 'GM', 'front'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when role is not GM', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.setZIndex(SCENE_ID, 'img-1', 'Player', 'front'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('persists after zorder change', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithThreeObjects());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await svc.setZIndex(SCENE_ID, 'txt-1', 'GM', 'front');
    expect(drawSvc.persist).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// duplicateObject
// ---------------------------------------------------------------------------

describe('SceneAnnotationService.duplicateObject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pushes new object with a different UUID', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { newObject } = await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    expect(newObject.id).not.toBe('img-1');
    expect(typeof newObject.id).toBe('string');
    expect(newObject.id.length).toBeGreaterThan(0);
  });

  it('offsets x and y by +20', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { newObject } = await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    // Source: x=10, y=10
    expect(newObject.x).toBe(30);
    expect(newObject.y).toBe(30);
  });

  it('places duplicate on top (zIndex = max+1)', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithThreeObjects());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    // max zIndex is 2; duplicate should be 3
    const { newObject } = await svc.duplicateObject(SCENE_ID, 'txt-1', 'GM', USER_ID);
    expect(newObject.zIndex).toBe(3);
  });

  it('appends new object to annotations.objects[]', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { annotations, newObject } = await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    const found = (annotations.objects ?? []).find((o) => o.id === newObject.id);
    expect(found).toBeDefined();
  });

  it('duplicate of image type: also pushes to images[] mirror with new id', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { annotations, newObject } = await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    const imgEntry = annotations.images.find((i) => i.id === newObject.id);
    expect(imgEntry).toBeDefined();
    expect(imgEntry?.x).toBe(30);
    expect(imgEntry?.y).toBe(30);
  });

  it('duplicate of text type: also pushes to texts[] mirror with new id', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithText());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { annotations, newObject } = await svc.duplicateObject(SCENE_ID, 'txt-t1', 'GM', USER_ID);
    const textEntry = annotations.texts.find((t) => t.id === newObject.id);
    expect(textEntry).toBeDefined();
    expect(textEntry?.x).toBe(50); // 30+20
    expect(textEntry?.y).toBe(60); // 40+20
  });

  it('duplicate of stroke type: also pushes to strokes[] mirror with new strokeId', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithStroke());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { annotations, newObject } = await svc.duplicateObject(SCENE_ID, 'stroke-s1', 'GM', USER_ID);
    const strokeEntry = annotations.strokes.find((s) => s.strokeId === newObject.id);
    expect(strokeEntry).toBeDefined();
    // Original stroke has no x/y (undefined → 0), so offset is 20
    expect(strokeEntry?.x).toBe(20);
    expect(strokeEntry?.y).toBe(20);
  });

  it('preserves source type on duplicate', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { newObject } = await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    expect(newObject.type).toBe('image');
  });

  it('throws 404 when objectId does not exist', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.duplicateObject(SCENE_ID, 'ghost-id', 'GM', USER_ID),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when role is not GM', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await expect(
      svc.duplicateObject(SCENE_ID, 'img-1', 'Player', USER_ID),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('persists after duplicate', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    expect(drawSvc.persist).toHaveBeenCalledOnce();
  });

  it('original object is unchanged after duplicate', async () => {
    const drawSvc = makeDrawService(makeAnnotationsWithImage());
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never);

    const { annotations } = await svc.duplicateObject(SCENE_ID, 'img-1', 'GM', USER_ID);
    const original = (annotations.objects ?? []).find((o) => o.id === 'img-1');
    expect(original?.x).toBe(10);
    expect(original?.y).toBe(10);
  });
});

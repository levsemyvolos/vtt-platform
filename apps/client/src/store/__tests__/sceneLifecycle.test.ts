import { describe, it, expect } from 'vitest';
import type { SceneDTO } from '@vtt/shared';
import sceneReducer, {
  hydrateScene,
  lockSceneObject,
  setSceneObjectZIndex,
  appendSceneObject,
} from '../scene';

function makeScene(): SceneDTO {
  return {
    id: 'scene-1',
    roomId: 'room-1',
    name: 'S',
    gridSize: 50,
    gridWidth: 10,
    gridHeight: 10,
    gridVisible: true,
    isActive: true,
    isHidden: false,
    fogShapes: [],
    annotations: { schemaVersion: 2, strokes: [], texts: [], images: [], objects: [] },
    tokens: [],
    backgroundFit: 'cover',
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1.0,
  };
}

function makeSceneWithImage(): SceneDTO {
  return {
    ...makeScene(),
    annotations: {
      schemaVersion: 2,
      strokes: [],
      texts: [],
      images: [
        {
          id: 'img-1',
          userId: 'u1',
          x: 0,
          y: 0,
          assetId: 'asset-1',
          width: 100,
          height: 100,
          rotation: 0,
          locked: false,
        },
      ],
      objects: [
        {
          id: 'img-1',
          type: 'image',
          userId: 'u1',
          x: 0,
          y: 0,
          zIndex: 5,
          assetId: 'asset-1',
          width: 100,
          height: 100,
          rotation: 0,
          locked: false,
          layer: 'tile' as const,
          visibility: 'all' as const,
        },
      ],
    },
  };
}

function makeSceneWithMultipleObjects(): SceneDTO {
  return {
    ...makeScene(),
    annotations: {
      schemaVersion: 2,
      strokes: [],
      texts: [],
      images: [],
      objects: [
        { id: 'obj-1', type: 'text', userId: 'u1', x: 0, y: 0, zIndex: 1, text: 'A', fontSize: 16, color: '#fff', layer: 'overlay' as const, visibility: 'all' as const },
        { id: 'obj-2', type: 'text', userId: 'u1', x: 10, y: 10, zIndex: 3, text: 'B', fontSize: 16, color: '#fff', layer: 'overlay' as const, visibility: 'all' as const },
        { id: 'obj-3', type: 'text', userId: 'u1', x: 20, y: 20, zIndex: 7, text: 'C', fontSize: 16, color: '#fff', layer: 'overlay' as const, visibility: 'all' as const },
      ],
    },
  };
}

// ─── lockSceneObject ───────────────────────────────────────────────────────

describe('scene slice — lockSceneObject', () => {
  it('sets locked=true on the matching objects[] entry', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, lockSceneObject({ objectId: 'img-1', locked: true }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj?.locked).toBe(true);
  });

  it('mirrors locked=true to images[] entry', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, lockSceneObject({ objectId: 'img-1', locked: true }));
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img?.locked).toBe(true);
  });

  it('sets locked=false (unlock) on objects[] and images[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, lockSceneObject({ objectId: 'img-1', locked: true }));
    state = sceneReducer(state, lockSceneObject({ objectId: 'img-1', locked: false }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(obj?.locked).toBe(false);
    expect(img?.locked).toBe(false);
  });

  it('is idempotent — re-dispatching same value yields same state', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, lockSceneObject({ objectId: 'img-1', locked: true }));
    const after1 = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, lockSceneObject({ objectId: 'img-1', locked: true }));
    expect(JSON.stringify(state.current?.annotations)).toBe(after1);
  });

  it('is a no-op for a missing objectId (does not throw)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    const before = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, lockSceneObject({ objectId: 'nonexistent', locked: true }));
    expect(JSON.stringify(state.current?.annotations)).toBe(before);
  });
});

// ─── setSceneObjectZIndex ──────────────────────────────────────────────────

describe('scene slice — setSceneObjectZIndex', () => {
  it("'front' bumps target to max(peerZIndices)+1", () => {
    // peers: obj-1=1, obj-3=7; target obj-2=3 → front = 7+1 = 8
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithMultipleObjects()));
    state = sceneReducer(state, setSceneObjectZIndex({ objectId: 'obj-2', direction: 'front' }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'obj-2');
    expect(obj?.zIndex).toBe(8);
  });

  it("'back' drops target to min(peerZIndices)-1", () => {
    // peers: obj-1=1, obj-3=7; target obj-2=3 → back = 1-1 = 0
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithMultipleObjects()));
    state = sceneReducer(state, setSceneObjectZIndex({ objectId: 'obj-2', direction: 'back' }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'obj-2');
    expect(obj?.zIndex).toBe(0);
  });

  it('allows negative zIndex when going to back beyond 0', () => {
    // peers: obj-2=3, obj-3=7; target obj-1=1 → back = 3-1=2... wait, peers = [3,7], min=3, 3-1=2
    // Let's use an already-at-minimum scenario where min peer is 1
    const scene: SceneDTO = {
      ...makeScene(),
      annotations: {
        schemaVersion: 2,
        strokes: [],
        texts: [],
        images: [],
        objects: [
          { id: 'obj-a', type: 'text', userId: 'u1', x: 0, y: 0, zIndex: 0, text: 'A', fontSize: 16, color: '#fff', layer: 'overlay' as const, visibility: 'all' as const },
          { id: 'obj-b', type: 'text', userId: 'u1', x: 0, y: 0, zIndex: 0, text: 'B', fontSize: 16, color: '#fff', layer: 'overlay' as const, visibility: 'all' as const },
        ],
      },
    };
    let state = sceneReducer(undefined, hydrateScene(scene));
    // target obj-a, direction=back → min(peers=[0])-1 = -1
    state = sceneReducer(state, setSceneObjectZIndex({ objectId: 'obj-a', direction: 'back' }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'obj-a');
    expect(obj?.zIndex).toBe(-1);
  });

  it('zIndex unchanged when there are no peers (single object)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    const before = state.current?.annotations.objects?.find((o) => o.id === 'img-1')?.zIndex;
    state = sceneReducer(state, setSceneObjectZIndex({ objectId: 'img-1', direction: 'front' }));
    const after = state.current?.annotations.objects?.find((o) => o.id === 'img-1')?.zIndex;
    expect(after).toBe(before);
  });

  it('is a no-op for a missing objectId (does not throw)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithMultipleObjects()));
    const before = JSON.stringify(state.current?.annotations.objects);
    state = sceneReducer(state, setSceneObjectZIndex({ objectId: 'nonexistent', direction: 'front' }));
    expect(JSON.stringify(state.current?.annotations.objects)).toBe(before);
  });
});

// ─── appendSceneObject ─────────────────────────────────────────────────────

describe('scene slice — appendSceneObject', () => {
  it('pushes a new image object to objects[] and creates images[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    const newObj = {
      id: 'new-img',
      type: 'image' as const,
      userId: 'u1',
      x: 10,
      y: 20,
      zIndex: 99,
      assetId: 'asset-99',
      width: 64,
      height: 64,
      rotation: 0,
      layer: 'tile' as const,
      visibility: 'all' as const,
    };
    state = sceneReducer(state, appendSceneObject(newObj));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'new-img');
    expect(obj).toBeDefined();
    expect(obj?.type).toBe('image');

    const img = state.current?.annotations.images.find((i) => i.id === 'new-img');
    expect(img).toBeDefined();
    expect(img?.assetId).toBe('asset-99');
    expect(img?.x).toBe(10);
    expect(img?.y).toBe(20);
  });

  it('pushes a new text object to objects[] and creates texts[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    const newObj = {
      id: 'new-text',
      type: 'text' as const,
      userId: 'u1',
      x: 5,
      y: 5,
      zIndex: 1,
      text: 'Hello',
      fontSize: 16,
      color: '#fff',
      layer: 'overlay' as const,
      visibility: 'all' as const,
    };
    state = sceneReducer(state, appendSceneObject(newObj));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'new-text');
    expect(obj).toBeDefined();

    const txt = state.current?.annotations.texts.find((t) => t.id === 'new-text');
    expect(txt).toBeDefined();
    expect(txt?.text).toBe('Hello');
  });

  it('pushes a new stroke object to objects[] and creates strokes[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    const newObj = {
      id: 'new-stroke',
      type: 'stroke' as const,
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 2,
      points: [0, 0, 10, 10],
      color: '#f00',
      strokeWidth: 3,
      layer: 'overlay' as const,
      visibility: 'all' as const,
    };
    state = sceneReducer(state, appendSceneObject(newObj));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'new-stroke');
    expect(obj).toBeDefined();

    const stroke = state.current?.annotations.strokes.find((s) => s.strokeId === 'new-stroke');
    expect(stroke).toBeDefined();
    expect(stroke?.color).toBe('#f00');
  });

  it('replaces existing object (same id) — no duplicate in objects[]', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));

    // dispatch same id with updated position
    const updatedObj = {
      id: 'img-1',
      type: 'image' as const,
      userId: 'u1',
      x: 99,
      y: 99,
      zIndex: 50,
      assetId: 'asset-1',
      width: 100,
      height: 100,
      layer: 'tile' as const,
      visibility: 'all' as const,
    };
    state = sceneReducer(state, appendSceneObject(updatedObj));

    const allObjects = state.current?.annotations.objects ?? [];
    const matches = allObjects.filter((o) => o.id === 'img-1');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.x).toBe(99);
    expect(matches[0]?.y).toBe(99);
  });

  it('replaces existing images[] mirror on duplicate id — no duplicate in images[]', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));

    const updatedObj = {
      id: 'img-1',
      type: 'image' as const,
      userId: 'u1',
      x: 55,
      y: 77,
      zIndex: 10,
      assetId: 'asset-1',
      width: 200,
      height: 200,
      layer: 'tile' as const,
      visibility: 'all' as const,
    };
    state = sceneReducer(state, appendSceneObject(updatedObj));

    const allImages = state.current?.annotations.images ?? [];
    const matches = allImages.filter((i) => i.id === 'img-1');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.width).toBe(200);
    expect(matches[0]?.x).toBe(55);
  });
});

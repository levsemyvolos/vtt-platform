import { describe, it, expect } from 'vitest';
import type { SceneDTO } from '@vtt/shared';
import sceneReducer, {
  hydrateScene,
  clearScene,
  removeSceneObject,
  selectSceneObject,
  deselectSceneObject,
  transformSceneObjectOptimistic,
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
  };
}

function makeSceneWithImage(): SceneDTO {
  return {
    ...makeScene(),
    annotations: {
      schemaVersion: 2,
      strokes: [],
      texts: [],
      images: [{ id: 'img-1', userId: 'u1', x: 0, y: 0, assetId: 'asset-1', width: 100, height: 100, rotation: 0 }],
      objects: [{ id: 'img-1', type: 'image', userId: 'u1', x: 0, y: 0, zIndex: 0, assetId: 'asset-1', width: 100, height: 100, rotation: 0 }],
    },
  };
}

describe('scene slice — scene object selection reducers', () => {
  it('selectSceneObject sets selectedSceneObjectId', () => {
    const state = sceneReducer(undefined, selectSceneObject('id-1'));
    expect(state.selectedSceneObjectId).toBe('id-1');
  });

  it('deselectSceneObject resets selectedSceneObjectId to null', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, deselectSceneObject());
    expect(state.selectedSceneObjectId).toBeNull();
  });

  it('removeSceneObject clears selectedSceneObjectId when the removed object was selected', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, selectSceneObject('id-1'));
    state = sceneReducer(state, removeSceneObject('id-1'));
    expect(state.selectedSceneObjectId).toBeNull();
  });

  it('removeSceneObject keeps selectedSceneObjectId when a different object is removed', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, selectSceneObject('id-1'));
    state = sceneReducer(state, removeSceneObject('other'));
    expect(state.selectedSceneObjectId).toBe('id-1');
  });

  it('hydrateScene resets selectedSceneObjectId to null', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, hydrateScene(makeScene()));
    expect(state.selectedSceneObjectId).toBeNull();
  });

  it('clearScene resets selectedSceneObjectId to null', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, clearScene());
    expect(state.selectedSceneObjectId).toBeNull();
  });
});

describe('scene slice — transformSceneObjectOptimistic', () => {
  it('mutates objects[] entry with new width, height, rotation', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', width: 200, height: 150, rotation: 45 }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj).toBeDefined();
    expect(obj?.width).toBe(200);
    expect(obj?.height).toBe(150);
    expect(obj?.rotation).toBe(45);
  });

  it('mutates images[] mirror entry with new width, height, rotation', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', width: 200, height: 150, rotation: 45 }));
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img).toBeDefined();
    expect(img?.width).toBe(200);
    expect(img?.height).toBe(150);
    expect(img?.rotation).toBe(45);
  });

  it('is a no-op for a missing id (does not throw, state unchanged)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    const before = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'nonexistent', width: 999, height: 999, rotation: 90 }));
    expect(JSON.stringify(state.current?.annotations)).toBe(before);
  });

  it('is idempotent — dispatching same values twice yields same state', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', width: 200, height: 150, rotation: 45 }));
    const after1 = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', width: 200, height: 150, rotation: 45 }));
    expect(JSON.stringify(state.current?.annotations)).toBe(after1);
  });
});

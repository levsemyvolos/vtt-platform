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
      images: [{ id: 'img-1', userId: 'u1', x: 0, y: 0, assetId: 'asset-1', width: 100, height: 100, rotation: 0 }],
      objects: [{ id: 'img-1', type: 'image', userId: 'u1', x: 0, y: 0, zIndex: 0, assetId: 'asset-1', width: 100, height: 100, rotation: 0, layer: 'tile' as const, visibility: 'all' as const }],
    },
  };
}

describe('scene slice — scene object selection reducers (multi-select, Sess 3 Mini-C)', () => {
  it('selectSceneObject(string) selects a single id', () => {
    const state = sceneReducer(undefined, selectSceneObject('id-1'));
    expect(state.selectedSceneObjectIds).toEqual(['id-1']);
  });

  it('selectSceneObject({ id }) selects a single id (object form)', () => {
    const state = sceneReducer(undefined, selectSceneObject({ id: 'id-1' }));
    expect(state.selectedSceneObjectIds).toEqual(['id-1']);
  });

  it('selectSceneObject plain replaces selection (no additive)', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, selectSceneObject('id-2'));
    expect(state.selectedSceneObjectIds).toEqual(['id-2']);
  });

  it('selectSceneObject with additive=true adds a new id to selection', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, selectSceneObject({ id: 'id-2', additive: true }));
    expect(state.selectedSceneObjectIds).toEqual(['id-1', 'id-2']);
  });

  it('selectSceneObject with additive=true toggles out an already-selected id', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, selectSceneObject({ id: 'id-2', additive: true }));
    state = sceneReducer(state, selectSceneObject({ id: 'id-1', additive: true }));
    expect(state.selectedSceneObjectIds).toEqual(['id-2']);
  });

  it('deselectSceneObject clears all selected ids', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, selectSceneObject({ id: 'id-2', additive: true }));
    state = sceneReducer(state, deselectSceneObject());
    expect(state.selectedSceneObjectIds).toEqual([]);
  });

  it('removeSceneObject removes id from selectedSceneObjectIds when selected', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, selectSceneObject('id-1'));
    state = sceneReducer(state, selectSceneObject({ id: 'id-2', additive: true }));
    state = sceneReducer(state, removeSceneObject('id-1'));
    expect(state.selectedSceneObjectIds).toEqual(['id-2']);
  });

  it('removeSceneObject keeps selection when a different object is removed', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, selectSceneObject('id-1'));
    state = sceneReducer(state, removeSceneObject('other'));
    expect(state.selectedSceneObjectIds).toEqual(['id-1']);
  });

  it('hydrateScene resets selectedSceneObjectIds to []', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, hydrateScene(makeScene()));
    expect(state.selectedSceneObjectIds).toEqual([]);
  });

  it('clearScene resets selectedSceneObjectIds to []', () => {
    let state = sceneReducer(undefined, selectSceneObject('id-1'));
    state = sceneReducer(state, clearScene());
    expect(state.selectedSceneObjectIds).toEqual([]);
  });
});

describe('scene slice — selection for text and stroke objects (Mini-E)', () => {
  it('selectSceneObject works for a text object id', () => {
    const state = sceneReducer(undefined, selectSceneObject('text-1'));
    expect(state.selectedSceneObjectIds).toEqual(['text-1']);
  });

  it('selectSceneObject works for a stroke object id', () => {
    const state = sceneReducer(undefined, selectSceneObject('stroke-1'));
    expect(state.selectedSceneObjectIds).toEqual(['stroke-1']);
  });

  it('additive shift-click supports mixed image + text + stroke selection', () => {
    let state = sceneReducer(undefined, selectSceneObject('img-1'));
    state = sceneReducer(state, selectSceneObject({ id: 'text-1', additive: true }));
    state = sceneReducer(state, selectSceneObject({ id: 'stroke-1', additive: true }));
    expect(state.selectedSceneObjectIds).toEqual(['img-1', 'text-1', 'stroke-1']);
  });

  it('replacing selection from text to stroke clears the previous selection', () => {
    let state = sceneReducer(undefined, selectSceneObject('text-1'));
    state = sceneReducer(state, selectSceneObject('stroke-1'));
    expect(state.selectedSceneObjectIds).toEqual(['stroke-1']);
  });

  it('additive deselect toggles a text id out of a mixed selection', () => {
    let state = sceneReducer(undefined, selectSceneObject('img-1'));
    state = sceneReducer(state, selectSceneObject({ id: 'text-1', additive: true }));
    state = sceneReducer(state, selectSceneObject({ id: 'stroke-1', additive: true }));
    state = sceneReducer(state, selectSceneObject({ id: 'text-1', additive: true }));
    expect(state.selectedSceneObjectIds).toEqual(['img-1', 'stroke-1']);
  });
});

describe('scene slice — transformSceneObjectOptimistic', () => {
  it('mutates objects[] entry with new x, y, width, height, rotation', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', x: 20, y: 30, width: 200, height: 150, rotation: 45 }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj).toBeDefined();
    expect(obj?.x).toBe(20);
    expect(obj?.y).toBe(30);
    expect(obj?.width).toBe(200);
    expect(obj?.height).toBe(150);
    expect(obj?.rotation).toBe(45);
  });

  it('mutates images[] mirror entry with new x, y, width, height, rotation', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', x: 20, y: 30, width: 200, height: 150, rotation: 45 }));
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img).toBeDefined();
    expect(img?.x).toBe(20);
    expect(img?.y).toBe(30);
    expect(img?.width).toBe(200);
    expect(img?.height).toBe(150);
    expect(img?.rotation).toBe(45);
  });

  it('is a no-op for a missing id (does not throw, state unchanged)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    const before = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'nonexistent', x: 0, y: 0, width: 999, height: 999, rotation: 90 }));
    expect(JSON.stringify(state.current?.annotations)).toBe(before);
  });

  it('is idempotent — dispatching same values twice yields same state', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', x: 20, y: 30, width: 200, height: 150, rotation: 45 }));
    const after1 = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', x: 20, y: 30, width: 200, height: 150, rotation: 45 }));
    expect(JSON.stringify(state.current?.annotations)).toBe(after1);
  });

  it('accepts negative x/y without clamping (off-screen overlays are valid)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithImage()));
    state = sceneReducer(state, transformSceneObjectOptimistic({ objectId: 'img-1', x: -50, y: -100, width: 100, height: 100, rotation: 0 }));
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(obj?.x).toBe(-50);
    expect(obj?.y).toBe(-100);
    expect(img?.x).toBe(-50);
    expect(img?.y).toBe(-100);
  });
});

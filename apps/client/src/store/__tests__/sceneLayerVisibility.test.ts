import { describe, it, expect } from 'vitest';
import type { SceneDTO, SceneObject } from '@vtt/shared';
import sceneReducer, {
  hydrateScene,
  selectSceneObject,
  setSceneObjectLayer,
  setSceneObjectVisibility,
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
    annotations: {
      schemaVersion: 2,
      strokes: [],
      texts: [],
      images: [],
      objects: [],
    },
    tokens: [],
    backgroundFit: 'cover',
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1.0,
  };
}

function makeSceneWithAll(): SceneDTO {
  return {
    ...makeScene(),
    annotations: {
      schemaVersion: 2,
      strokes: [{ strokeId: 'stroke-1', userId: 'u1', points: [0, 0, 10, 10], color: '#f00', width: 2, layer: 'tile' }],
      texts: [{ id: 'text-1', userId: 'u1', x: 0, y: 0, text: 'Hello', fontSize: 14, color: '#000', layer: 'tile' }],
      images: [{ id: 'img-1', userId: 'u1', x: 0, y: 0, assetId: 'asset-1', width: 100, height: 100, layer: 'tile' }],
      objects: [
        {
          id: 'img-1',
          type: 'image',
          userId: 'u1',
          x: 0,
          y: 0,
          zIndex: 0,
          assetId: 'asset-1',
          width: 100,
          height: 100,
          layer: 'tile' as const,
          visibility: 'all' as const,
        },
        {
          id: 'text-1',
          type: 'text',
          userId: 'u1',
          x: 0,
          y: 0,
          zIndex: 1,
          text: 'Hello',
          fontSize: 14,
          color: '#000',
          layer: 'tile' as const,
          visibility: 'all' as const,
        },
        {
          id: 'stroke-1',
          type: 'stroke',
          userId: 'u1',
          x: 0,
          y: 0,
          zIndex: 2,
          points: [0, 0, 10, 10],
          color: '#f00',
          strokeWidth: 2,
          layer: 'tile' as const,
          visibility: 'all' as const,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// setSceneObjectLayer
// ---------------------------------------------------------------------------

describe('scene slice — setSceneObjectLayer (Sess 5 Mini-B)', () => {
  it('updates layer on an image in objects[] and images[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(state, setSceneObjectLayer({ objectId: 'img-1', layer: 'overlay' }));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj?.layer).toBe('overlay');
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img?.layer).toBe('overlay');
  });

  it('updates layer on a text object in objects[] and texts[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(state, setSceneObjectLayer({ objectId: 'text-1', layer: 'overlay' }));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'text-1');
    expect(obj?.layer).toBe('overlay');
    const txt = state.current?.annotations.texts.find((t) => t.id === 'text-1');
    expect(txt?.layer).toBe('overlay');
  });

  it('updates layer on a stroke in objects[] and strokes[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(state, setSceneObjectLayer({ objectId: 'stroke-1', layer: 'overlay' }));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'stroke-1');
    expect(obj?.layer).toBe('overlay');
    const stroke = state.current?.annotations.strokes.find((s) => s.strokeId === 'stroke-1');
    expect(stroke?.layer).toBe('overlay');
  });

  it('is a no-op for a non-existent objectId (no throw, state unchanged)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    const before = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, setSceneObjectLayer({ objectId: 'nonexistent', layer: 'overlay' }));
    expect(JSON.stringify(state.current?.annotations)).toBe(before);
  });

  it('is idempotent — re-dispatching same layer is a no-op', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(state, setSceneObjectLayer({ objectId: 'img-1', layer: 'overlay' }));
    const after1 = JSON.stringify(state.current?.annotations);
    state = sceneReducer(state, setSceneObjectLayer({ objectId: 'img-1', layer: 'overlay' }));
    expect(JSON.stringify(state.current?.annotations)).toBe(after1);
  });
});

// ---------------------------------------------------------------------------
// setSceneObjectVisibility
// ---------------------------------------------------------------------------

describe('scene slice — setSceneObjectVisibility (Sess 5 Mini-B)', () => {
  it('GM: gm-only flip updates visibility flag, does NOT remove object from objects[]', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: true }),
    );

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj).toBeDefined();
    expect(obj?.visibility).toBe('gm-only');
    // images[] mirror also updated
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img?.visibility).toBe('gm-only');
  });

  it('Player: gm-only flip removes object from objects[] (critical branch)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: false }),
    );

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj).toBeUndefined();
  });

  it('Player: gm-only flip removes object from images[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: false }),
    );
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img).toBeUndefined();
  });

  it('Player: gm-only flip removes text from texts[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'text-1', visibility: 'gm-only', viewerIsGM: false }),
    );
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'text-1');
    expect(obj).toBeUndefined();
    const txt = state.current?.annotations.texts.find((t) => t.id === 'text-1');
    expect(txt).toBeUndefined();
  });

  it('Player: gm-only flip removes stroke from strokes[] mirror', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'stroke-1', visibility: 'gm-only', viewerIsGM: false }),
    );
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'stroke-1');
    expect(obj).toBeUndefined();
    const stroke = state.current?.annotations.strokes.find((s) => s.strokeId === 'stroke-1');
    expect(stroke).toBeUndefined();
  });

  it('Player: gm-only flip clears id from selectedSceneObjectIds when selected', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(state, selectSceneObject('img-1'));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: false }),
    );
    expect(state.selectedSceneObjectIds).not.toContain('img-1');
  });

  it('Player: gm-only flip leaves other selected ids intact', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    state = sceneReducer(state, selectSceneObject('text-1'));
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: false }),
    );
    expect(state.selectedSceneObjectIds).toContain('text-1');
  });

  it("visibility 'all' (Player): updates flag without removing object", () => {
    // Put the object into gm-only as GM first, then flip back to 'all' as Player
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    // GM marks gm-only
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: true }),
    );
    // Flip back to 'all' (Player branch — no removal)
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'all', viewerIsGM: false }),
    );
    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj).toBeDefined();
    expect(obj?.visibility).toBe('all');
  });

  it('is a no-op for a non-existent objectId (no throw)', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));
    // should not throw
    expect(() => {
      sceneReducer(
        state,
        setSceneObjectVisibility({ objectId: 'nonexistent', visibility: 'gm-only', viewerIsGM: false }),
      );
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Sess 5.5 Mini-A: Player re-add via appendSceneObject when flipping to 'all'
// ---------------------------------------------------------------------------

describe('scene slice — appendSceneObject re-adds object stripped by gm-only (Sess 5.5 Mini-A)', () => {
  it('Player: object removed by gm-only flip is re-added via appendSceneObject', () => {
    // Start as Player (viewerIsGM: false); object is in state
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));

    // Player receives gm-only flip — object is removed from local state
    state = sceneReducer(
      state,
      setSceneObjectVisibility({ objectId: 'img-1', visibility: 'gm-only', viewerIsGM: false }),
    );
    expect(state.current?.annotations.objects?.find((o) => o.id === 'img-1')).toBeUndefined();

    // GM flips back to 'all' — server sends full object in payload.
    // Client socket handler dispatches appendSceneObject(payload.object).
    const fullObject: SceneObject = {
      id: 'img-1',
      type: 'image',
      userId: 'u1',
      x: 0,
      y: 0,
      zIndex: 0,
      assetId: 'asset-1',
      width: 100,
      height: 100,
      layer: 'tile',
      visibility: 'all',
    };
    state = sceneReducer(state, appendSceneObject(fullObject));

    const obj = state.current?.annotations.objects?.find((o) => o.id === 'img-1');
    expect(obj).toBeDefined();
    expect(obj?.visibility).toBe('all');
    // images[] mirror also re-added
    const img = state.current?.annotations.images.find((i) => i.id === 'img-1');
    expect(img).toBeDefined();
  });

  it('GM: appendSceneObject is idempotent — existing object is replaced in-place, no duplicate', () => {
    let state = sceneReducer(undefined, hydrateScene(makeSceneWithAll()));

    const updatedObject: SceneObject = {
      id: 'img-1',
      type: 'image',
      userId: 'u1',
      x: 5,
      y: 5,
      zIndex: 0,
      assetId: 'asset-1',
      width: 100,
      height: 100,
      layer: 'tile',
      visibility: 'all',
    };
    state = sceneReducer(state, appendSceneObject(updatedObject));

    const objects = state.current?.annotations.objects ?? [];
    const matching = objects.filter((o) => o.id === 'img-1');
    expect(matching).toHaveLength(1);
    expect(matching[0]?.x).toBe(5);
  });
});

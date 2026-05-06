import { describe, it, expect } from 'vitest';
import type { SceneDTO } from '@vtt/shared';
import sceneReducer, {
  hydrateScene,
  clearScene,
  applyDraftSceneUpdate,
  clearDraftSceneUpdate,
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

describe('scene slice — draftPatch reducers (Mini-A)', () => {
  it('initial state has draftPatch === null', () => {
    const state = sceneReducer(undefined, { type: '@@INIT' });
    expect(state.draftPatch).toBeNull();
  });

  it('applyDraftSceneUpdate on null current is a no-op (guard)', () => {
    // state.current is null in default initial state
    const before = sceneReducer(undefined, { type: '@@INIT' });
    expect(before.current).toBeNull();
    const after = sceneReducer(before, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    expect(after.draftPatch).toBeNull();
    expect(after.current).toBeNull();
  });

  it('applyDraftSceneUpdate sets draftPatch and mirrors into current', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    expect(state.draftPatch).toEqual({ gridSize: 80 });
    expect(state.current?.gridSize).toBe(80);
  });

  it('cumulative: two applyDraftSceneUpdate calls merge patches', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { backgroundAssetId: 'a1' } }));
    expect(state.draftPatch).toEqual({ gridSize: 80, backgroundAssetId: 'a1' });
  });

  it('override: same key applied twice — last wins', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 100 } }));
    expect(state.draftPatch?.gridSize).toBe(100);
    expect(state.current?.gridSize).toBe(100);
  });

  it('applyDraftSceneUpdate with backgroundUrl mirrors into current.backgroundUrl', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(
      state,
      applyDraftSceneUpdate({ patch: { backgroundAssetId: 'a1' }, backgroundUrl: 'http://cdn.test/img.png?sig=x' }),
    );
    expect(state.draftPatch?.backgroundAssetId).toBe('a1');
    expect(state.current?.backgroundUrl).toBe('http://cdn.test/img.png?sig=x');
  });

  it('applyDraftSceneUpdate mirrors gridWidth, gridHeight, gridVisible into current', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(
      state,
      applyDraftSceneUpdate({ patch: { gridWidth: 20, gridHeight: 15, gridVisible: false } }),
    );
    expect(state.current?.gridWidth).toBe(20);
    expect(state.current?.gridHeight).toBe(15);
    expect(state.current?.gridVisible).toBe(false);
    expect(state.draftPatch).toEqual({ gridWidth: 20, gridHeight: 15, gridVisible: false });
  });

  it('clearDraftSceneUpdate resets draftPatch to null but does not touch current', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    expect(state.draftPatch).not.toBeNull();
    const currentBefore = JSON.stringify(state.current);
    state = sceneReducer(state, clearDraftSceneUpdate());
    expect(state.draftPatch).toBeNull();
    // current is untouched (Done handler will re-hydrate separately)
    expect(JSON.stringify(state.current)).toBe(currentBefore);
  });

  it('hydrateScene resets draftPatch to null', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    expect(state.draftPatch).not.toBeNull();
    state = sceneReducer(state, hydrateScene(makeScene()));
    expect(state.draftPatch).toBeNull();
  });

  it('clearScene resets draftPatch to null', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 80 } }));
    expect(state.draftPatch).not.toBeNull();
    state = sceneReducer(state, clearScene());
    expect(state.draftPatch).toBeNull();
  });

  it('applyDraftSceneUpdate mirrors backgroundFit into current', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { backgroundFit: 'contain' } }));
    expect(state.current?.backgroundFit).toBe('contain');
    expect(state.draftPatch).toEqual({ backgroundFit: 'contain' });
  });

  it('applyDraftSceneUpdate mirrors backgroundOffsetX and backgroundOffsetY into current', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(
      state,
      applyDraftSceneUpdate({ patch: { backgroundOffsetX: 100, backgroundOffsetY: -50 } }),
    );
    expect(state.current?.backgroundOffsetX).toBe(100);
    expect(state.current?.backgroundOffsetY).toBe(-50);
    expect(state.draftPatch).toEqual({ backgroundOffsetX: 100, backgroundOffsetY: -50 });
  });

  it('applyDraftSceneUpdate mirrors backgroundScale into current', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { backgroundScale: 1.5 } }));
    expect(state.current?.backgroundScale).toBe(1.5);
    expect(state.draftPatch).toEqual({ backgroundScale: 1.5 });
  });

  it('background fields merge cumulatively into draftPatch with grid fields', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { gridSize: 60 } }));
    state = sceneReducer(state, applyDraftSceneUpdate({ patch: { backgroundFit: 'stretch', backgroundScale: 2 } }));
    expect(state.draftPatch).toEqual({ gridSize: 60, backgroundFit: 'stretch', backgroundScale: 2 });
    expect(state.current?.gridSize).toBe(60);
    expect(state.current?.backgroundFit).toBe('stretch');
    expect(state.current?.backgroundScale).toBe(2);
  });
});

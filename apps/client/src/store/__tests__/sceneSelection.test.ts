import { describe, it, expect } from 'vitest';
import type { SceneDTO } from '@vtt/shared';
import sceneReducer, {
  hydrateScene,
  clearScene,
  removeSceneObject,
  selectSceneObject,
  deselectSceneObject,
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

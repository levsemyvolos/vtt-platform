import { describe, it, expect } from 'vitest';
import type { SceneDTO, FogShape } from '@vtt/shared';
import sceneReducer, {
  hydrateScene,
  fogShapeAdded,
  fogShapeRemoved,
  fogShapesSet,
  clearFogMask,
} from '../scene';

function makeShape(overrides: Partial<FogShape>): FogShape {
  return {
    id: 'a',
    x: 0, y: 0, w: 10, h: 10,
    mode: 'hide',
    createdAt: 0,
    ...overrides,
  };
}

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

describe('scene slice — fog shape reducers', () => {
  it('appends a fog shape and orders by createdAt', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, fogShapeAdded({
      roomId: 'room-1', sceneId: 'scene-1', shape: makeShape({ id: 'b', createdAt: 20 }),
    }));
    state = sceneReducer(state, fogShapeAdded({
      roomId: 'room-1', sceneId: 'scene-1', shape: makeShape({ id: 'a', createdAt: 10 }),
    }));
    expect(state.current?.fogShapes?.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('ignores duplicate add by id', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, fogShapeAdded({
      roomId: 'room-1', sceneId: 'scene-1', shape: makeShape({ id: 'x', createdAt: 1 }),
    }));
    state = sceneReducer(state, fogShapeAdded({
      roomId: 'room-1', sceneId: 'scene-1', shape: makeShape({ id: 'x', createdAt: 999 }),
    }));
    expect(state.current?.fogShapes?.length).toBe(1);
  });

  it('removes a shape by id', () => {
    let state = sceneReducer(undefined, hydrateScene({
      ...makeScene(),
      fogShapes: [makeShape({ id: 'a' }), makeShape({ id: 'b' })],
    }));
    state = sceneReducer(state, fogShapeRemoved({ roomId: 'r', sceneId: 'scene-1', shapeId: 'a' }));
    expect(state.current?.fogShapes?.map((s) => s.id)).toEqual(['b']);
  });

  it('fogShapesSet replaces and sorts the list', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, fogShapesSet([
      makeShape({ id: 'b', createdAt: 5 }),
      makeShape({ id: 'a', createdAt: 1 }),
    ]));
    expect(state.current?.fogShapes?.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('clearFogMask empties the list', () => {
    let state = sceneReducer(undefined, hydrateScene({
      ...makeScene(),
      fogShapes: [makeShape({ id: 'a' })],
    }));
    state = sceneReducer(state, clearFogMask());
    expect(state.current?.fogShapes).toEqual([]);
  });

  it('ignores ops for the wrong sceneId', () => {
    let state = sceneReducer(undefined, hydrateScene(makeScene()));
    state = sceneReducer(state, fogShapeAdded({
      roomId: 'r', sceneId: 'other-scene', shape: makeShape({ id: 'z' }),
    }));
    expect(state.current?.fogShapes ?? []).toEqual([]);
  });
});

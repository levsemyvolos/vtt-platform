import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sceneReducer, { hydrateScene } from '../../../store/scene';
import StatusBar from '../StatusBar';
import type { SceneDTO, TokenPublicDTO } from '@vtt/shared';

afterEach(() => cleanup());

function makeToken(id: string): TokenPublicDTO {
  return {
    id,
    name: `Token ${id}`,
    x: 0,
    y: 0,
    sceneId: 'scene-1',
    imageUrl: '',
    version: 1,
  };
}

function makeScene(overrides?: Partial<SceneDTO>): SceneDTO {
  return {
    id: 'scene-1',
    roomId: 'room-1',
    name: 'Склеп Страда',
    gridSize: 5,
    gridWidth: 20,
    gridHeight: 20,
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
    ...overrides,
  };
}

function makeStore(scene: SceneDTO | null = null) {
  const store = configureStore({ reducer: { scene: sceneReducer } });
  if (scene) store.dispatch(hydrateScene(scene));
  return store;
}

describe('StatusBar', () => {
  it('renders scene name and grid dimensions', () => {
    const store = makeStore(makeScene({ name: 'Склеп', gridWidth: 24, gridHeight: 18 }));
    render(
      <Provider store={store}>
        <StatusBar />
      </Provider>,
    );
    expect(screen.getByText('Склеп')).toBeTruthy();
    expect(screen.getByText('24×18')).toBeTruthy();
  });

  it('shows token count', () => {
    const scene = makeScene({ tokens: [makeToken('t1'), makeToken('t2')] });
    const store = makeStore(scene);
    render(
      <Provider store={store}>
        <StatusBar />
      </Provider>,
    );
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('renders without a scene', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <StatusBar />
      </Provider>,
    );
    const bar = screen.getByRole('contentinfo');
    expect(bar).toBeTruthy();
  });

  it('has aria-live polite', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <StatusBar />
      </Provider>,
    );
    const el = screen.getByRole('contentinfo');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });
});

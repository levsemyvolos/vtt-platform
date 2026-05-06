import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  (global as unknown as Record<string, unknown>).ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sceneReducer from '../../../store/scene';
import canvasViewportReducer from '../../../store/canvasViewport';
import toastReducer from '../../../store/toast';
import preferencesReducer from '../../../store/preferences';
import roomReducer from '../../../store/room';
import annotationsReducer from '../../../store/annotations';
import initiativeReducer from '../../../store/initiative';
import GameCanvas from '../GameCanvas';
import type { SceneDTO } from '@vtt/shared';

vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: React.ReactNode }) => <div data-testid="konva-stage">{children}</div>,
  Layer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Rect: () => <div />,
  Image: () => <div />,
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: () => <div />,
  Circle: () => <div />,
  Line: () => <div />,
}));

afterEach(() => cleanup());

const MOCK_SCENE: SceneDTO = {
  id: 's1',
  roomId: 'room-1',
  name: 'Test',
  gridSize: 50,
  gridWidth: 10,
  gridHeight: 10,
  gridVisible: true,
  isActive: true,
  isHidden: false,
  fogShapes: [],
  annotations: { schemaVersion: 2, strokes: [], texts: [], images: [], objects: [] },
  tokens: [],
  backgroundFit: 'cover' as const,
  backgroundOffsetX: 0,
  backgroundOffsetY: 0,
  backgroundScale: 1.0,
};

function makeStore() {
  return configureStore({
    reducer: {
      scene: sceneReducer,
      canvasViewport: canvasViewportReducer,
      toast: toastReducer,
      preferences: preferencesReducer,
      room: roomReducer,
      annotations: annotationsReducer,
      initiative: initiativeReducer,
    },
  });
}

describe('GameCanvas mode prop', () => {
  it('mode="edit" renders canvas without crashing', () => {
    const store = makeStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <GameCanvas
          scene={MOCK_SCENE}
          myRole="GM"
          myUserId="u1"
          mode="edit"
        />
      </Provider>,
    );
    expect(getByTestId('konva-stage')).toBeTruthy();
  });
});

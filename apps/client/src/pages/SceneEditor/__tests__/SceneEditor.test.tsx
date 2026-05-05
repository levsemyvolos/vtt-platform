import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Rect: () => null,
  Image: () => null,
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: () => null,
  Circle: () => null,
  Line: () => null,
}));
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import roomReducer, { startEditing, setCurrentRoom } from '../../../store/room';
import sessionReducer from '../../../store/session';
import sceneReducer from '../../../store/scene';
import canvasViewportReducer from '../../../store/canvasViewport';
import preferencesReducer from '../../../store/preferences';
import toastReducer from '../../../store/toast';
import SceneEditor from '../SceneEditor';

afterEach(() => cleanup());

const MOCK_ROOM = {
  id: 'r1',
  name: 'Test Room',
  ownerId: 'u1',
  gameSystem: 'dnd5e',
  status: 'active' as const,
  members: [],
  createdAt: '2026-01-01',
  lastActiveAt: '2026-01-01',
};

const MOCK_USER = { id: 'u1', email: 'gm@test.com', name: 'GM User' };

function makeStore(role: 'GM' | 'Player') {
  const store = configureStore({
    reducer: {
      room: roomReducer,
      session: sessionReducer,
      scene: sceneReducer,
      canvasViewport: canvasViewportReducer,
      preferences: preferencesReducer,
      toast: toastReducer,
    },
    preloadedState: {
      session: {
        currentUser: MOCK_USER,
        accessToken: 'tok',
        status: 'authenticated' as const,
        error: null,
        errorSource: null,
        prefilledInviteCode: null,
      },
    },
  });
  store.dispatch(
    setCurrentRoom({
      ...MOCK_ROOM,
      members: [{ userId: 'u1', name: 'GM User', role }],
    }),
  );
  store.dispatch(startEditing('scene-1'));
  return store;
}

describe('SceneEditor', () => {
  it('renders 3-zone layout for GM', () => {
    const store = makeStore('GM');
    render(
      <Provider store={store}>
        <SceneEditor />
      </Provider>,
    );
    expect(screen.getByTestId('scene-editor-canvas')).toBeTruthy();
    expect(screen.getByTestId('scene-editor')).toBeTruthy();
  });

  it('Player role triggers stopEditing and renders nothing', async () => {
    const store = makeStore('Player');
    render(
      <Provider store={store}>
        <SceneEditor />
      </Provider>,
    );
    await act(async () => {});
    expect(screen.queryByTestId('scene-editor')).toBeNull();
    expect(store.getState().room.editingSceneId).toBeNull();
  });
});

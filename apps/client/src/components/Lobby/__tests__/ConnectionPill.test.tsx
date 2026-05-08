import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from '../../../store/session';
import roomReducer from '../../../store/room';
import ConnectionPill from '../ConnectionPill';

vi.mock('../../../api/socket', () => ({
  getSocket: vi.fn(() => ({
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeStore(opts: {
  sessionStatus?: 'authenticated' | 'idle' | 'loading' | 'error' | 'bootstrapping';
  roomStatus?: 'idle' | 'loading' | 'loaded' | 'error';
}) {
  return configureStore({
    reducer: { session: sessionReducer, room: roomReducer },
    preloadedState: {
      session: {
        currentUser: { id: 'u1', email: 'test@x.com', name: 'Test' },
        accessToken: 't',
        status: opts.sessionStatus ?? 'authenticated',
        error: null,
        errorSource: null,
        prefilledInviteCode: null,
      },
      room: {
        currentRoom: null,
        ownRooms: [],
        members: [],
        status: opts.roomStatus ?? 'loaded',
        error: null,
        sessionActive: false,
        editingSceneId: null,
      },
    },
  });
}

describe('ConnectionPill', () => {
  it('renders compact three-stage connection status', () => {
    const store = makeStore({ sessionStatus: 'authenticated', roomStatus: 'loaded' });
    render(
      <Provider store={store}>
        <ConnectionPill />
      </Provider>,
    );

    expect(screen.getByText('Auth')).toBeTruthy();
    expect(screen.getByText('Кімната')).toBeTruthy();
    expect(screen.getByText('Канал')).toBeTruthy();
  });

  it('shows error styling when room status fails', () => {
    const store = makeStore({ sessionStatus: 'authenticated', roomStatus: 'error' });
    const { container } = render(
      <Provider store={store}>
        <ConnectionPill />
      </Provider>,
    );

    expect(container.querySelector('[class*="error"]')).toBeTruthy();
  });
});

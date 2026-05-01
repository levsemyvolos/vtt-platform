import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from '../../../store/session';
import roomReducer from '../../../store/room';
import ConnectionStepper from '../ConnectionStepper';

vi.mock('../../../api/socket', () => ({
  getSocket: vi.fn(() => ({
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
      },
      room: {
        currentRoom: null,
        ownRooms: [],
        members: [],
        status: opts.roomStatus ?? 'idle',
        error: null,
        sessionActive: false,
      },
    },
  });
}

describe('ConnectionStepper', () => {
  it('renders 3 steps in correct order', () => {
    const store = makeStore({ sessionStatus: 'authenticated', roomStatus: 'loaded' });
    render(
      <Provider store={store}>
        <ConnectionStepper />
      </Provider>,
    );
    expect(screen.getByText('Автентифікація')).toBeTruthy();
    expect(screen.getByText('Завантаження сцени')).toBeTruthy();
    expect(screen.getByText('Відкриття WS-каналу')).toBeTruthy();
  });

  it('step 1 has done styling when session is authenticated', () => {
    const store = makeStore({ sessionStatus: 'authenticated', roomStatus: 'idle' });
    const { container } = render(
      <Provider store={store}>
        <ConnectionStepper />
      </Provider>,
    );
    const doneStep = container.querySelector('[class*="done"]');
    expect(doneStep).toBeTruthy();
  });

  it('shows diagnostic text when networkError is provided', () => {
    const store = makeStore({ sessionStatus: 'authenticated', roomStatus: 'loaded' });
    render(
      <Provider store={store}>
        <ConnectionStepper networkError="З'єднання відхилено" />
      </Provider>,
    );
    expect(screen.getByText("З'єднання відхилено")).toBeTruthy();
  });

  it('no done steps when session is still loading', () => {
    const store = makeStore({ sessionStatus: 'loading', roomStatus: 'idle' });
    const { container } = render(
      <Provider store={store}>
        <ConnectionStepper />
      </Provider>,
    );
    const doneSteps = container.querySelectorAll('[class*="done"]');
    expect(doneSteps.length).toBe(0);
  });
});

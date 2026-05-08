import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from '../../../../store/session';
import preferencesReducer from '../../../../store/preferences';
import { AppShell } from '..';

afterEach(() => cleanup());

vi.mock('../../../../hooks/useWebRTCStats', () => ({ useWebRTCStats: () => ({ rtt: null }) }));
vi.mock('../../../../hooks/useOnlineUsers', () => ({ useOnlineUsers: () => ({ count: 0 }) }));

interface SessionState {
  currentUser: { id: string; email: string; name: string } | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error' | 'bootstrapping';
  error: string | null;
  errorSource: 'bootstrap' | 'authForm' | 'transient' | null;
  prefilledInviteCode: string | null;
}

function makeStore(opts: { user?: { name: string; email: string; id: string } | null }) {
  const sessionState: SessionState = {
    currentUser: opts.user ?? { id: 'u1', email: 'sm@x.com', name: 'Семиволос Микита' },
    accessToken: 't',
    status: 'authenticated',
    error: null,
    errorSource: null,
    prefilledInviteCode: null,
  };
  return configureStore({
    reducer: { session: sessionReducer, preferences: preferencesReducer },
    preloadedState: { session: sessionState },
  });
}

function renderShell(opts: { user?: { name: string; email: string; id: string } | null } = {}) {
  const store = makeStore(opts);
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppShell>
          <div data-testid="content">Dashboard goes here</div>
        </AppShell>
      </MemoryRouter>
    </Provider>,
  );
}

describe('AppShell', () => {
  it('renders children inside main area', () => {
    renderShell();
    expect(screen.getByTestId('content').textContent).toBe('Dashboard goes here');
  });

  it('renders sticky topbar header with navigation landmark', () => {
    renderShell();
    const header = screen.getByRole('banner');
    expect(header).toBeTruthy();
    expect(screen.getByLabelText('Головна навігація')).toBeTruthy();
  });

  it('renders no aside sidebar', () => {
    renderShell();
    expect(document.querySelector('aside')).toBeNull();
  });

  it('shows UserChipAvatar with user initial and toggles dropdown', () => {
    renderShell();
    const avatarBtn = screen.getByTitle('Семиволос Микита');
    expect(avatarBtn.textContent).toBe('С');
    fireEvent.click(avatarBtn);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('does not render avatar when user is null', () => {
    renderShell({ user: null });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from '../../../../store/session';
import preferencesReducer from '../../../../store/preferences';
import { AppShell } from '..';

afterEach(() => cleanup());

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

describe('AppShell', () => {
  it('renders children inside main area', () => {
    const store = makeStore({});
    render(
      <Provider store={store}>
        <AppShell>
          <div data-testid="content">Dashboard goes here</div>
        </AppShell>
      </Provider>,
    );
    expect(screen.getByTestId('content').textContent).toBe('Dashboard goes here');
  });

  it('renders LeftNav with active "Мої кімнати" nav item', () => {
    const store = makeStore({});
    render(
      <Provider store={store}>
        <AppShell>
          <div />
        </AppShell>
      </Provider>,
    );
    const items = screen.getAllByRole('button');
    // The rooms nav-item should be marked aria-current="page"
    const rooms = items.find((b) => b.getAttribute('aria-current') === 'page');
    expect(rooms).toBeTruthy();
  });

  it('shows UserChip with current user name and toggles dropdown', () => {
    const store = makeStore({});
    render(
      <Provider store={store}>
        <AppShell>
          <div />
        </AppShell>
      </Provider>,
    );
    const chip = screen.getByRole('button', { expanded: false });
    expect(chip.textContent).toContain('Семиволос Микита');
    fireEvent.click(chip);
    expect(screen.getByRole('menu')).toBeTruthy();
  });
});

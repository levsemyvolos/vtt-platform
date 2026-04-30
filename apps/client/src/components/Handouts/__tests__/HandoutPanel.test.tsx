import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import handoutsReducer from '../../../store/handouts';
import membersReducer from '../../../store/members';
import HandoutPanel from '../HandoutPanel';
import type { HandoutDTO } from '@vtt/shared';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ROOM_ID = 'room-test';

const mockHandout: HandoutDTO = {
  id: 'h-1',
  roomId: ROOM_ID,
  title: 'Secret Map',
  body: 'There is a cave at the north.',
  recipientIds: [],
  createdAt: new Date().toISOString(),
};

function makeStore(opts: {
  handouts?: HandoutDTO[];
  players?: { id: string; email: string; name: string }[];
}) {
  return configureStore({
    reducer: { handouts: handoutsReducer, members: membersReducer },
    preloadedState: {
      handouts: {
        items: opts.handouts ?? [],
        status: 'loaded' as const,
        error: null,
      },
      members: {
        byRoom: opts.players
          ? {
              [ROOM_ID]: {
                gm: { id: 'gm-1', email: 'gm@test.com', name: 'GM' },
                players: opts.players,
                observers: [],
              },
            }
          : {},
        status: {},
      },
    },
  });
}

describe('HandoutPanel — GM view (Ф7.4)', () => {
  it('renders handout title in GM view', () => {
    const store = makeStore({ handouts: [mockHandout] });
    render(
      <Provider store={store}>
        <HandoutPanel roomId={ROOM_ID} myRole="GM" />
      </Provider>,
    );
    expect(screen.getByText('Secret Map')).toBeTruthy();
  });

  it('shows member picker checkboxes when players are loaded (γ-variant)', () => {
    const players = [
      { id: 'p-1', email: 'alice@test.com', name: 'Alice' },
      { id: 'p-2', email: 'bob@test.com', name: 'Bob' },
    ];
    const store = makeStore({ handouts: [mockHandout], players });
    render(
      <Provider store={store}>
        <HandoutPanel roomId={ROOM_ID} myRole="GM" />
      </Provider>,
    );
    expect(screen.getByLabelText('Видати Alice')).toBeTruthy();
    expect(screen.getByLabelText('Видати Bob')).toBeTruthy();
  });

  it('Grant button is disabled when no player is checked', () => {
    const players = [{ id: 'p-1', email: 'alice@test.com', name: 'Alice' }];
    const store = makeStore({ handouts: [mockHandout], players });
    render(
      <Provider store={store}>
        <HandoutPanel roomId={ROOM_ID} myRole="GM" />
      </Provider>,
    );
    const grantBtn = screen.getByRole('button', { name: /^Grant$/i });
    expect(grantBtn).toHaveProperty('disabled', true);
  });

  it('Grant button becomes enabled after checking a player', () => {
    const players = [{ id: 'p-1', email: 'alice@test.com', name: 'Alice' }];
    const store = makeStore({ handouts: [mockHandout], players });
    render(
      <Provider store={store}>
        <HandoutPanel roomId={ROOM_ID} myRole="GM" />
      </Provider>,
    );
    const checkbox = screen.getByLabelText('Видати Alice');
    fireEvent.click(checkbox);
    const grantBtn = screen.getByRole('button', { name: /^Grant$/i });
    expect(grantBtn).toHaveProperty('disabled', false);
  });

  it('shows no-players tooltip when players list is empty', () => {
    const store = makeStore({ handouts: [mockHandout], players: [] });
    render(
      <Provider store={store}>
        <HandoutPanel roomId={ROOM_ID} myRole="GM" />
      </Provider>,
    );
    expect(screen.getByText(/персонажа/i)).toBeTruthy();
  });

  it('returns null for Observer role', () => {
    const store = makeStore({});
    const { container } = render(
      <Provider store={store}>
        <HandoutPanel roomId={ROOM_ID} myRole="Observer" />
      </Provider>,
    );
    expect(container.firstChild).toBeNull();
  });
});

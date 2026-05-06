import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import initiativeReducer from '../../../store/initiative';
import membersReducer from '../../../store/members';
import sceneReducer from '../../../store/scene';
import initiativeUiReducer from '../../../store/initiativeUi';
import InitiativeTracker from '../InitiativeTracker';
import * as initiativeStore from '../../../store/initiative';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ROOM_ID = 'room-1';
const SCENE_ID = 'scene-1';

function makeStore(membersPreloaded?: {
  gm: { id: string; email: string; name: string };
  players: { id: string; email: string; name: string }[];
}) {
  const preloadedState = membersPreloaded
    ? {
        members: {
          byRoom: {
            [ROOM_ID]: {
              gm: membersPreloaded.gm,
              players: membersPreloaded.players,
              observers: [],
            },
          },
          status: { [ROOM_ID]: 'loaded' as const },
        },
      }
    : undefined;

  return configureStore({
    reducer: { initiative: initiativeReducer, initiativeUi: initiativeUiReducer, members: membersReducer, scene: sceneReducer },
    preloadedState,
  });
}

describe('InitiativeTracker — AddEntry modal (GM)', () => {
  it('opens add-entry form on "Додати" click', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId={SCENE_ID} myRole="GM" roomId={ROOM_ID} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /додати позицію/i }));
    expect(screen.getByRole('button', { name: /OK/i })).toBeTruthy();
  });

  it('shows member dropdown when room members are loaded', () => {
    const store = makeStore({
      gm: { id: 'gm-1', email: 'gm@test.com', name: 'GameMaster' },
      players: [{ id: 'p-1', email: 'p1@test.com', name: 'Alice' }],
    });
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId={SCENE_ID} myRole="GM" roomId={ROOM_ID} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /додати позицію/i }));
    expect(screen.getByRole('combobox', { name: /оберіть учасника/i })).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('GameMaster')).toBeTruthy();
  });

  it('dispatches addEntryThunk with custom name when "Власне ім\'я" checked', async () => {
    const spy = vi.spyOn(initiativeStore, 'addEntryThunk').mockReturnValue({
      type: 'initiative/addEntry/fulfilled',
      unwrap: () => Promise.resolve({ entries: [], currentRound: 1, sceneId: SCENE_ID }),
    } as unknown as ReturnType<typeof initiativeStore.addEntryThunk>);

    const store = makeStore();
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId={SCENE_ID} myRole="GM" roomId={ROOM_ID} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /додати позицію/i }));
    // Switch to NPC mode via radio button (label is localised: "Custom NPC" / "Власний NPC")
    fireEvent.click(screen.getByRole('radio', { name: /npc/i }));
    // Fill custom name
    fireEvent.change(screen.getByRole('textbox', { name: /ім'я учасника/i }), {
      target: { value: 'Goblin King' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /OK/i }).closest('form')!);

    // addEntryThunk must be called (we check the spy)
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
  });

  it('renders read-only list for Player role (no add button)', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId={SCENE_ID} myRole="Player" roomId={ROOM_ID} />
      </Provider>,
    );
    expect(screen.queryByRole('button', { name: /додати позицію/i })).toBeNull();
  });
});

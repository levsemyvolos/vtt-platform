import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

vi.mock('../src/api/apiFetch', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { InitiativeEntryDTO } from '@vtt/shared';
import initiativeReducer, { hydrateInitiative } from '../src/store/initiative';
import membersReducer from '../src/store/members';
import InitiativeTracker from '../src/components/Sidebar/InitiativeTracker';

const ROOM_ID = 'room-1';

function buildStore(entries: InitiativeEntryDTO[], currentRound = 1) {
  const store = configureStore({ reducer: { initiative: initiativeReducer, members: membersReducer } });
  store.dispatch(
    hydrateInitiative({ sceneId: 'scene-1', entries, currentRound }),
  );
  return store;
}

const ENTRIES: InitiativeEntryDTO[] = [
  { id: 'e1', name: 'Aragorn', initiative: 17, orderIndex: 0, isCurrent: true },
  { id: 'e2', name: 'Gimli', initiative: 12, orderIndex: 1, isCurrent: false },
];

describe('InitiativeTracker', () => {
  it('renders entries with current-round header for any role', () => {
    const store = buildStore(ENTRIES);
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId="scene-1" myRole="Player" roomId={ROOM_ID} />
      </Provider>,
    );
    expect(screen.getByText('Раунд: 1')).toBeTruthy();
    expect(screen.getByText('Aragorn')).toBeTruthy();
    expect(screen.getByText('Gimli')).toBeTruthy();
  });

  it('hides GM controls for Player role', () => {
    const store = buildStore(ENTRIES);
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId="scene-1" myRole="Player" roomId={ROOM_ID} />
      </Provider>,
    );
    expect(screen.queryByLabelText('Наступний хід')).toBeNull();
    expect(screen.queryByLabelText('Додати позицію')).toBeNull();
  });

  it('shows GM controls when role is GM', () => {
    const store = buildStore(ENTRIES);
    render(
      <Provider store={store}>
        <InitiativeTracker sceneId="scene-1" myRole="GM" roomId={ROOM_ID} />
      </Provider>,
    );
    expect(screen.getByLabelText('Наступний хід')).toBeTruthy();
    expect(screen.getByLabelText('Додати позицію')).toBeTruthy();
  });
});

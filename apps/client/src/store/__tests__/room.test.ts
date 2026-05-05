/**
 * Wave 6.5.1 — Regression tests for fetchRooms URL formation with sort/order/filter (B6-BUG-002).
 * URL-based navigation replaced the localStorage F5-persistence pattern (BUG-001-F5);
 * those tests have been removed as the mechanism no longer exists.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import roomReducer, {
  setCurrentRoom,
  clearRoom,
  removeRoom,
  fetchRoom,
  fetchRooms,
  deleteRoom,
} from '../room';
import type { RoomDTO } from '@vtt/shared';

function makeRoom(overrides: Partial<RoomDTO> = {}): RoomDTO {
  return {
    id: 'room-1',
    name: 'Test Room',
    gameSystem: 'D&D 5e',
    status: 'lobby',
    ownerId: 'user-1',
    members: [],
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    ...overrides,
  };
}

function init() {
  return roomReducer(undefined, { type: '@@INIT' });
}

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// setCurrentRoom
// ---------------------------------------------------------------------------
describe('setCurrentRoom', () => {
  it('sets currentRoom in state', () => {
    const room = makeRoom();
    const s = roomReducer(init(), setCurrentRoom(room));
    expect(s.currentRoom?.id).toBe('room-1');
    expect(s.status).toBe('loaded');
  });
});

// ---------------------------------------------------------------------------
// clearRoom
// ---------------------------------------------------------------------------
describe('clearRoom', () => {
  it('clears currentRoom from state', () => {
    const withRoom = roomReducer(init(), setCurrentRoom(makeRoom()));
    const cleared = roomReducer(withRoom, clearRoom());
    expect(cleared.currentRoom).toBeNull();
    expect(cleared.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// fetchRoom thunk
// ---------------------------------------------------------------------------
describe('fetchRoom thunk', () => {
  it('fulfilled sets currentRoom in state', () => {
    const room = makeRoom({ id: 'restored-room' });
    const action = fetchRoom.fulfilled(room, '', 'restored-room');
    const s = roomReducer(init(), action);
    expect(s.currentRoom?.id).toBe('restored-room');
  });

  it('rejected sets error status', () => {
    const action = fetchRoom.rejected(null, '', 'deleted-room', 'Не вдалося завантажити кімнату');
    const s = roomReducer(init(), action);
    expect(s.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// removeRoom
// ---------------------------------------------------------------------------
describe('removeRoom', () => {
  it('clears currentRoom when removed room was currentRoom', () => {
    const room = makeRoom({ id: 'room-gone' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    const s = roomReducer(withRoom, removeRoom('room-gone'));
    expect(s.currentRoom).toBeNull();
  });

  it('does NOT clear currentRoom when a different room is removed', () => {
    const room = makeRoom({ id: 'room-active' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    const s = roomReducer(withRoom, removeRoom('room-other'));
    expect(s.currentRoom?.id).toBe('room-active');
  });
});

// ---------------------------------------------------------------------------
// deleteRoom thunk
// ---------------------------------------------------------------------------
describe('deleteRoom thunk', () => {
  it('fulfilled clears currentRoom when deleted room was currentRoom', () => {
    const room = makeRoom({ id: 'room-deleted' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    const action = deleteRoom.fulfilled('room-deleted', '', 'room-deleted');
    const s = roomReducer(withRoom, action);
    expect(s.currentRoom).toBeNull();
  });

  it('does NOT clear currentRoom when a different room is deleted', () => {
    const room = makeRoom({ id: 'room-active' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    const action = deleteRoom.fulfilled('room-other', '', 'room-other');
    const s = roomReducer(withRoom, action);
    expect(s.currentRoom?.id).toBe('room-active');
  });
});

// ---------------------------------------------------------------------------
// B6-BUG-002 — fetchRooms URL formation with sort/order/filter
// ---------------------------------------------------------------------------

vi.mock('../../api/apiFetch', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

import { configureStore } from '@reduxjs/toolkit';
import { apiFetch } from '../../api/apiFetch';

const apiFetchMock = apiFetch as ReturnType<typeof vi.fn>;

function makeStoreForSort() {
  return configureStore({ reducer: { room: roomReducer } });
}

describe('B6-BUG-002: fetchRooms URL formation', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValue([]);
  });

  it('no opts → calls /api/rooms without query string', async () => {
    const store = makeStoreForSort();
    await store.dispatch(fetchRooms(undefined));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/rooms');
  });

  it('sort=name, order=asc → ?sort=name&order=asc', async () => {
    const store = makeStoreForSort();
    await store.dispatch(fetchRooms({ sort: 'name', order: 'asc' }));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/rooms?sort=name&order=asc');
  });

  it('sort=lastActive, order=desc → ?sort=lastActive&order=desc', async () => {
    const store = makeStoreForSort();
    await store.dispatch(fetchRooms({ sort: 'lastActive', order: 'desc' }));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/rooms?sort=lastActive&order=desc');
  });

  it('filter=owned → ?filter=owned', async () => {
    const store = makeStoreForSort();
    await store.dispatch(fetchRooms({ filter: 'owned' }));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/rooms?filter=owned');
  });

  it('sort=created, order=asc, filter=invited → all three params present', async () => {
    const store = makeStoreForSort();
    await store.dispatch(fetchRooms({ sort: 'created', order: 'asc', filter: 'invited' }));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/rooms?sort=created&order=asc&filter=invited');
  });

  it('empty opts {} → /api/rooms without query string', async () => {
    const store = makeStoreForSort();
    await store.dispatch(fetchRooms({}));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/rooms');
  });
});

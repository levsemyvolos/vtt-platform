/**
 * Wave 6.3.3 — Regression tests for currentRoomId localStorage persistence (BUG-001-F5).
 *
 * Verifies that:
 *  - setCurrentRoom writes the room ID to localStorage
 *  - clearRoom removes the room ID from localStorage
 *  - fetchRoom.fulfilled writes the room ID to localStorage
 *  - fetchRoom.rejected removes the stale room ID from localStorage
 *  - removeRoom clears localStorage when the removed room was the currentRoom
 *  - deleteRoom.fulfilled clears localStorage when the deleted room was the currentRoom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import roomReducer, {
  setCurrentRoom,
  clearRoom,
  removeRoom,
  fetchRoom,
  deleteRoom,
  getPersistedRoomId,
} from '../room';
import type { RoomDTO } from '@vtt/shared';

const PERSISTED_KEY = 'vtt_current_room_id';

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

  it('BUG-001-F5: persists room ID to localStorage', () => {
    const room = makeRoom({ id: 'room-abc' });
    roomReducer(init(), setCurrentRoom(room));
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-abc');
  });

  it('BUG-001-F5: getPersistedRoomId returns the persisted ID', () => {
    const room = makeRoom({ id: 'room-xyz' });
    roomReducer(init(), setCurrentRoom(room));
    expect(getPersistedRoomId()).toBe('room-xyz');
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

  it('BUG-001-F5: removes room ID from localStorage', () => {
    roomReducer(init(), setCurrentRoom(makeRoom({ id: 'room-to-clear' })));
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-to-clear');

    const withRoom = roomReducer(init(), setCurrentRoom(makeRoom({ id: 'room-to-clear' })));
    roomReducer(withRoom, clearRoom());
    expect(localStorage.getItem(PERSISTED_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchRoom thunk
// ---------------------------------------------------------------------------
describe('fetchRoom thunk', () => {
  it('BUG-001-F5: fulfilled persists room ID to localStorage', () => {
    const room = makeRoom({ id: 'restored-room' });
    const action = fetchRoom.fulfilled(room, '', 'restored-room');
    roomReducer(init(), action);
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('restored-room');
  });

  it('BUG-001-F5: fulfilled sets currentRoom in state', () => {
    const room = makeRoom({ id: 'restored-room' });
    const action = fetchRoom.fulfilled(room, '', 'restored-room');
    const s = roomReducer(init(), action);
    expect(s.currentRoom?.id).toBe('restored-room');
  });

  it('BUG-001-F5: rejected clears stale room ID from localStorage', () => {
    // Pre-seed localStorage to simulate stale persisted ID
    localStorage.setItem(PERSISTED_KEY, 'deleted-room');
    const action = fetchRoom.rejected(null, '', 'deleted-room', 'Не вдалося завантажити кімнату');
    roomReducer(init(), action);
    expect(localStorage.getItem(PERSISTED_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// removeRoom
// ---------------------------------------------------------------------------
describe('removeRoom', () => {
  it('BUG-001-F5: clears localStorage when removed room was currentRoom', () => {
    const room = makeRoom({ id: 'room-gone' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-gone');

    roomReducer(withRoom, removeRoom('room-gone'));
    expect(localStorage.getItem(PERSISTED_KEY)).toBeNull();
  });

  it('does NOT clear localStorage when a different room is removed', () => {
    const room = makeRoom({ id: 'room-active' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-active');

    roomReducer(withRoom, removeRoom('room-other'));
    // localStorage should still have the active room
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-active');
  });
});

// ---------------------------------------------------------------------------
// deleteRoom thunk
// ---------------------------------------------------------------------------
describe('deleteRoom thunk', () => {
  it('BUG-001-F5: fulfilled clears localStorage when deleted room was currentRoom', () => {
    const room = makeRoom({ id: 'room-deleted' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-deleted');

    const action = deleteRoom.fulfilled('room-deleted', '', 'room-deleted');
    roomReducer(withRoom, action);
    expect(localStorage.getItem(PERSISTED_KEY)).toBeNull();
  });

  it('does NOT clear localStorage when a different room is deleted', () => {
    const room = makeRoom({ id: 'room-active' });
    const withRoom = roomReducer(init(), setCurrentRoom(room));
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-active');

    const action = deleteRoom.fulfilled('room-other', '', 'room-other');
    roomReducer(withRoom, action);
    expect(localStorage.getItem(PERSISTED_KEY)).toBe('room-active');
  });
});

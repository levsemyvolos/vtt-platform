/**
 * GameRoom Session Restore on F5 — Integration with localStorage
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getPersistedRoomId } from '../../../store/room';

describe('GameRoom — Session Restore on F5', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getPersistedRoomId returns null when localStorage is empty', () => {
    expect(getPersistedRoomId()).toBeNull();
  });

  it('getPersistedRoomId retrieves persisted room ID from localStorage', () => {
    const roomId = 'room-persist-test-123';
    localStorage.setItem('vtt_current_room_id', roomId);
    expect(getPersistedRoomId()).toBe(roomId);
  });

  it('Session restore: room ID persists across page reload', () => {
    const roomId = 'room-active-at-reload';
    localStorage.setItem('vtt_current_room_id', roomId);

    // Simulate page reload (localStorage survives, Redux state clears)
    const retrievedRoomId = getPersistedRoomId();

    // Bootstrap session can now call fetchRoom(retrievedRoomId)
    expect(retrievedRoomId).toBe(roomId);
  });
});

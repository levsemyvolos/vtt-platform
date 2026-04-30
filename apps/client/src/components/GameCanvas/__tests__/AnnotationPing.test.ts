import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import annotationsReducer, { addPing, removePing } from '../../../store/annotations';
import type { AnnotationPingPayload } from '@vtt/shared';

function makeStore() {
  return configureStore({ reducer: { annotations: annotationsReducer } });
}

function makePing(overrides?: Partial<AnnotationPingPayload>): AnnotationPingPayload {
  return {
    roomId: 'room-1',
    sceneId: 'scene-1',
    x: 100,
    y: 200,
    color: '#ef4444',
    userId: 'user-1',
    timestamp: 1700000001000,
    ...overrides,
  };
}

describe('annotations slice — ping dispatch + auto-fade', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('addPing → activePings contains the new ping', () => {
    const store = makeStore();
    const ping = makePing();
    store.dispatch(addPing(ping));
    expect(store.getState().annotations.activePings).toHaveLength(1);
    expect(store.getState().annotations.activePings[0]).toEqual(ping);
  });

  it('removePing after 3 s clears the ping (simulates socket.ts setTimeout)', () => {
    const store = makeStore();
    const ping = makePing({ timestamp: 1700000002000 });

    store.dispatch(addPing(ping));
    expect(store.getState().annotations.activePings).toHaveLength(1);

    // Simulate the setTimeout(3000) from socket.ts listener
    setTimeout(() => {
      store.dispatch(removePing(ping.timestamp));
    }, 3000);

    vi.advanceTimersByTime(3000);

    expect(store.getState().annotations.activePings).toHaveLength(0);
  });
});

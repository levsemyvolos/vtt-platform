import type { AudioPlayPayload } from '@vtt/shared';
import type { TypedServer } from '../types.js';
import type { AudioBroadcaster } from '../../services/AudioService.js';

/**
 * Builds a typed `audio:play` broadcaster bound to the room (table 2.14).
 *
 * No client-emitted `audio:*` events exist in vertical Ф6 — the universal
 * `audio:play` is **server → broadcast** only (§2.18 RBAC: only the GM may
 * change audio state, and the GM does it via REST). Scene-switch and
 * track-bind are routed through `AudioService.broadcast`, not through a
 * socket listener.
 *
 * Wire-up: pass the returned function to `AudioService` so the service stays
 * WSS-agnostic (it does not import socket.io directly — easier to unit-test
 * with a stub broadcaster, see AudioService.test.ts).
 */
export function buildAudioBroadcaster(io: TypedServer): AudioBroadcaster {
  return (roomId: string, payload: AudioPlayPayload) => {
    io.to(roomId).emit('audio:play', payload);
  };
}

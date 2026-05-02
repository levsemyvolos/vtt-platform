import type { AnnotationPingPayload } from '@vtt/shared';
import type { TypedServer, TypedSocket } from '../types.js';
import type { AnnotationService } from '../../services/AnnotationService.js';

/**
 * Builds a `cursor:ping` broadcaster bound to the room.
 *
 * Wire-up: pass the returned function to `AnnotationService` so the service
 * stays WSS-agnostic — easier to unit-test with a stub broadcaster.
 */
export function buildAnnotationBroadcaster(
  io: TypedServer,
): (roomId: string, payload: AnnotationPingPayload) => void {
  return (roomId, payload) => {
    io.to(roomId).emit('cursor:ping', payload);
  };
}

/**
 * Registers the `cursor:ping` listener for a socket connection.
 *
 * Guard: the socket must be joined to `payload.roomId` — off-room pings are
 * silently dropped (prevents cross-room spoofing). No RBAC role restriction:
 * Ф3.4.1 allows any role to send a ping.
 */
export function registerAnnotationHandlers(
  socket: TypedSocket,
  annotationService: AnnotationService,
): void {
  socket.on('cursor:ping', (payload: AnnotationPingPayload) => {
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
    annotationService.broadcastPing(payload);
  });
}

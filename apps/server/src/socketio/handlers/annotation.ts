import type { AnnotationPingPayload, MeasurePayload } from '@vtt/shared';
import type { TypedServer, TypedSocket } from '../types.js';
import type { AnnotationBroadcast } from '../../services/AnnotationService.js';

/**
 * Builds broadcast sinks for ephemeral annotation events.
 *
 * Returns an object so new event types can be added without changing the
 * AnnotationService constructor signature.
 */
export function buildAnnotationBroadcaster(io: TypedServer): AnnotationBroadcast {
  return {
    ping: (roomId: string, payload: AnnotationPingPayload) => {
      io.to(roomId).emit('cursor:ping', payload);
    },
    measure: (roomId: string, payload: MeasurePayload) => {
      io.to(roomId).emit('measure:start', payload);
    },
  };
}

/**
 * Registers ephemeral-annotation listeners for a connected socket.
 *
 * `cursor:ping` — any role; `measure:start` — any role (Ф3.4.3).
 * Both guards: socket must be joined to the claimed roomId (prevents cross-room spoofing).
 */
export function registerAnnotationHandlers(
  socket: TypedSocket,
  annotationService: import('../../services/AnnotationService.js').AnnotationService,
): void {
  socket.on('cursor:ping', (payload: AnnotationPingPayload) => {
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
    annotationService.broadcastPing(payload);
  });

  socket.on('measure:start', (payload: MeasurePayload) => {
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
    annotationService.broadcastMeasure(payload);
  });
}

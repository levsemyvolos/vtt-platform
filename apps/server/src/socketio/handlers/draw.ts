import type { DrawStrokePayload } from '@vtt/shared';
import type { TypedServer, TypedSocket } from '../types.js';
import type { DrawBroadcast } from '../../services/DrawService.js';

/** Builds broadcaster sinks for draw events (Ф3.4.2). */
export function buildDrawBroadcaster(io: TypedServer): DrawBroadcast {
  return {
    stroke: (roomId: string, payload: DrawStrokePayload) => {
      io.to(roomId).emit('draw:stroke', payload);
    },
    clear: (roomId: string, sceneId: string) => {
      io.to(roomId).emit('draw:clear', { roomId, sceneId });
    },
  };
}

/**
 * Registers `draw:stroke` and `draw:clear` listeners.
 *
 * RBAC: GM-only for both events — annotating the shared scene is a GM privilege (Ф3.4.2).
 * Guard: socket must be in the claimed roomId.
 */
export function registerDrawHandlers(
  socket: TypedSocket,
  drawService: import('../../services/DrawService.js').DrawService,
): void {
  socket.on('draw:stroke', (payload: DrawStrokePayload) => {
    if (socket.data.role !== 'GM') return;
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
    void drawService.addStroke(payload);
  });

  socket.on('draw:clear', (payload: { roomId: string; sceneId: string }) => {
    if (socket.data.role !== 'GM') return;
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
    void drawService.clearStrokes(payload.roomId, payload.sceneId);
  });
}

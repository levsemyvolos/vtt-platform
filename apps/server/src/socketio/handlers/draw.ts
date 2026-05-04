import type { DrawStrokePayload, FogMaskDiffPayload } from '@vtt/shared';
import type { TypedServer, TypedSocket } from '../types.js';
import type { DrawBroadcast } from '../../services/DrawService.js';
import type { SceneAnnotationService } from '../../services/SceneAnnotationService.js';

/** Builds broadcaster sinks for draw events (Ф3.4.2). */
export function buildDrawBroadcaster(io: TypedServer): DrawBroadcast {
  return {
    stroke: (roomId: string, payload: DrawStrokePayload) => {
      io.to(roomId).emit('draw:stroke', payload);
    },
    clear: (roomId: string, sceneId: string) => {
      io.to(roomId).emit('draw:clear', { roomId, sceneId });
    },
    fogDiff: (roomId: string, payload: FogMaskDiffPayload) => {
      io.to(roomId).emit('fog:mask-diff', payload);
    },
    fogClear: (roomId: string, sceneId: string) => {
      io.to(roomId).emit('fog:clear', { roomId, sceneId });
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
  io: TypedServer,
  socket: TypedSocket,
  drawService: import('../../services/DrawService.js').DrawService,
  sceneAnnotationService?: SceneAnnotationService,
): void {
  socket.on('draw:stroke', async (payload: DrawStrokePayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      await drawService.addStroke(payload);
    } catch (err) {
      console.error('[Socket] draw:stroke error:', err);
    }
  });

  socket.on('draw:clear', async (payload: { roomId: string; sceneId: string }) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      await drawService.clearStrokes(payload.roomId, payload.sceneId);
    } catch (err) {
      console.error('[Socket] draw:clear error:', err);
    }
  });

  socket.on('fog:mask-diff', async (payload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      await drawService.applyFogDiff(payload.roomId, payload);
    } catch (err) {
      console.error('[Socket] fog:mask-diff error:', err);
    }
  });

  socket.on('fog:clear', async (payload: { roomId: string; sceneId: string }) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      await drawService.clearFog(payload.roomId, payload.sceneId);
    } catch (err) {
      console.error('[Socket] fog:clear error:', err);
    }
  });

  socket.on('object:move', async (payload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      await sceneAnnotationService.moveAnnotation(
        payload.sceneId,
        payload.objectId,
        socket.data.userId,
        socket.data.role,
        { x: payload.x, y: payload.y },
      );
      io.to(payload.roomId).emit('object:move', payload);
    } catch (err) {
      console.error('[Socket] object:move error:', err);
    }
  });

  socket.on('object:delete', async (payload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      await sceneAnnotationService.removeAnnotation(
        payload.sceneId,
        payload.objectId,
        socket.data.userId,
        socket.data.role,
      );
      io.to(payload.roomId).emit('object:delete', payload);
    } catch (err) {
      console.error('[Socket] object:delete error:', err);
    }
  });
}

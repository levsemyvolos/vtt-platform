import type { DrawStrokePayload, FogShape, FogShapeAddPayload, FogShapeRemovePayload, SceneFlushPayload, SceneObjectTransformPayload, SceneObjectLockPayload, SceneObjectZOrderPayload, SceneObjectDuplicatePayload, SceneObjectSetLayerPayload, SceneObjectSetVisibilityPayload } from '@vtt/shared';
import type { TypedServer, TypedSocket } from '../types.js';
import type { DrawBroadcast } from '../../services/DrawService.js';
import { parseFogShapes } from '../../services/DrawService.js';

function hasValidDimensions(v: Partial<FogShape>): boolean {
  return (
    Number.isFinite(v.x) && Number.isFinite(v.y) &&
    Number.isFinite(v.w) && Number.isFinite(v.h) &&
    (v.w as number) > 0 && (v.h as number) > 0
  );
}

function isAddableFogShape(s: unknown): s is FogShape {
  if (!s || typeof s !== 'object') return false;
  const v = s as Partial<FogShape>;
  return (
    typeof v.id === 'string' &&
    (v.mode === 'hide' || v.mode === 'reveal') &&
    Number.isFinite(v.createdAt) &&
    hasValidDimensions(v)
  );
}
import type { SceneAnnotationService } from '../../services/SceneAnnotationService.js';
import type { SceneService } from '../../services/SceneService.js';

/** Builds broadcaster sinks for draw events (Ф3.4.2). */
export function buildDrawBroadcaster(io: TypedServer): DrawBroadcast {
  return {
    stroke: (roomId: string, payload: DrawStrokePayload) => {
      io.to(roomId).emit('draw:stroke', payload);
    },
    clear: (roomId: string, sceneId: string) => {
      io.to(roomId).emit('draw:clear', { roomId, sceneId });
    },
    fogShapeAdd: (roomId: string, payload: FogShapeAddPayload) => {
      io.to(roomId).emit('fog:shape-add', payload);
    },
    fogShapeRemove: (roomId: string, payload: FogShapeRemovePayload) => {
      io.to(roomId).emit('fog:shape-remove', payload);
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
  sceneService?: SceneService,
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

  socket.on('fog:shape-add', async (payload: FogShapeAddPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (!isAddableFogShape(payload.shape)) return;
      await drawService.addFogShape(payload);
    } catch (err) {
      console.error('[Socket] fog:shape-add error:', err);
    }
  });

  socket.on('fog:shape-remove', async (payload: FogShapeRemovePayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (typeof payload.shapeId !== 'string' || !payload.shapeId) return;
      await drawService.removeFogShape(payload);
    } catch (err) {
      console.error('[Socket] fog:shape-remove error:', err);
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

  socket.on('scene:flush', async (payload: SceneFlushPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      const shapes = parseFogShapes(payload.shapes);
      await drawService.setFogShapes(payload.sceneId, shapes);
      if (payload.annotations) {
        await drawService.persist(payload.sceneId, payload.annotations);
      }
      // Persist token positions from the Edit Scene staging buffer (Sess 5.5 Mini-C).
      // applyTokenSnapshot is a no-op when the list is empty or absent.
      if (sceneService && payload.tokens && payload.tokens.length > 0) {
        await sceneService.applyTokenSnapshot(payload.sceneId, payload.tokens);
      }
      const { roomId, sceneId } = payload;
      // Broadcast to ALL EXCEPT the sender — the sender (GM) already has correct local state.
      socket.broadcast.to(roomId).emit('fog:clear', { roomId, sceneId });
      for (const shape of shapes) {
        socket.broadcast.to(roomId).emit('fog:shape-add', { roomId, sceneId, shape });
      }
      if (payload.annotations) {
        socket.broadcast.to(roomId).emit('draw:clear', { roomId, sceneId });
        for (const s of payload.annotations.strokes ?? []) {
          socket.broadcast.to(roomId).emit('draw:stroke', {
            roomId, sceneId, strokeId: s.strokeId, userId: s.userId,
            points: s.points, color: s.color, width: s.width,
          });
        }
        // Broadcast full annotations (includes objects[] transforms/moves/deletes that
        // were buffered locally during Edit Scene and never emitted via object:* events).
        // Sender (GM) already has correct local state — exclude via socket.broadcast.
        // drawService.persist() updates the in-memory cache so getAnnotations() here
        // returns the freshly normalized data without an extra DB round-trip.
        const persistedAnnotations = await drawService.getAnnotations(sceneId);
        socket.broadcast.to(roomId).emit('annotations:updated', {
          sceneId,
          annotations: persistedAnnotations,
        });
      }
      // Deliver buffered scene-level mutations (background, grid, token positions)
      // that were staged during Edit Scene to all OTHER clients on Done.
      // scene:snapshot carries the full SceneDTO including updated token positions,
      // so Players receive new token state automatically via hydrateScene.
      if (sceneService) {
        const snapshot = await sceneService.getSnapshot(
          sceneId,
          socket.data.role,
          socket.data.userId,
        );
        socket.broadcast.to(roomId).emit('scene:snapshot', { scene: snapshot });
      }
    } catch (err) {
      console.error('[Socket] scene:flush error:', err);
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

  socket.on('object:transform', async (payload: SceneObjectTransformPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (
        typeof payload.x !== 'number' || !Number.isFinite(payload.x) ||
        typeof payload.y !== 'number' || !Number.isFinite(payload.y) ||
        typeof payload.width !== 'number' || !Number.isFinite(payload.width) ||
        typeof payload.height !== 'number' || !Number.isFinite(payload.height) ||
        typeof payload.rotation !== 'number' || !Number.isFinite(payload.rotation)
      ) return;
      await sceneAnnotationService.transformObject(
        payload.sceneId,
        payload.objectId,
        socket.data.role,
        { x: payload.x, y: payload.y, width: payload.width, height: payload.height, rotation: payload.rotation },
      );
      io.to(payload.roomId).emit('object:transform', payload);
    } catch (err) {
      console.error('[Socket] object:transform error:', err);
    }
  });

  socket.on('object:lock', async (payload: SceneObjectLockPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (typeof payload.locked !== 'boolean') return;
      await sceneAnnotationService.lockObject(payload.sceneId, payload.objectId, socket.data.role, payload.locked);
      io.to(payload.roomId).emit('object:lock', payload);
    } catch (err) {
      console.error('[Socket] object:lock error:', err);
    }
  });

  socket.on('object:zorder', async (payload: SceneObjectZOrderPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (payload.direction !== 'front' && payload.direction !== 'back') return;
      await sceneAnnotationService.setZIndex(payload.sceneId, payload.objectId, socket.data.role, payload.direction);
      io.to(payload.roomId).emit('object:zorder', payload);
    } catch (err) {
      console.error('[Socket] object:zorder error:', err);
    }
  });

  socket.on('object:duplicate', async (payload: SceneObjectDuplicatePayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      const { newObject } = await sceneAnnotationService.duplicateObject(
        payload.sceneId,
        payload.objectId,
        socket.data.role,
        socket.data.userId,
      );
      io.to(payload.roomId).emit('object:duplicated', {
        roomId: payload.roomId,
        sceneId: payload.sceneId,
        object: newObject,
      });
    } catch (err) {
      console.error('[Socket] object:duplicate error:', err);
    }
  });

  socket.on('object:set-layer', async (payload: SceneObjectSetLayerPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (payload.layer !== 'tile' && payload.layer !== 'overlay') return;
      await sceneAnnotationService.setObjectLayer(payload.sceneId, payload.objectId, socket.data.role, payload.layer);
      io.to(payload.roomId).emit('object:set-layer', payload);
    } catch (err) {
      console.error('[Socket] object:set-layer error:', err);
    }
  });

  socket.on('object:set-visibility', async (payload: SceneObjectSetVisibilityPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (payload.visibility !== 'all' && payload.visibility !== 'gm-only') return;
      const annotations = await sceneAnnotationService.setObjectVisibility(
        payload.sceneId, payload.objectId, socket.data.role, payload.visibility,
      );
      const updatedObject = (annotations.objects ?? []).find((o) => o.id === payload.objectId);
      io.to(payload.roomId).emit('object:set-visibility', {
        ...payload,
        ...(updatedObject !== undefined ? { object: updatedObject } : {}),
      });
    } catch (err) {
      console.error('[Socket] object:set-visibility error:', err);
    }
  });
}

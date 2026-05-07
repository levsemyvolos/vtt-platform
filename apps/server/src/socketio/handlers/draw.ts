import type { DrawStrokePayload, FogShape, FogShapeAddPayload, FogShapeRemovePayload, FogBitmapPushPayload, FogBitmapUpdatePayload, SceneFlushPayload, SceneObjectTransformPayload, SceneObjectLockPayload, SceneObjectZOrderPayload, SceneObjectDuplicatePayload, SceneObjectSetLayerPayload, SceneObjectSetVisibilityPayload, SceneObjectUpsertPayload } from '@vtt/shared';
import { FOG_BITMAP_MAX_DIM } from '@vtt/shared';
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

/** Sess 11 — guards `fog:bitmap-push` payload. Validates that the bitmap blob
 *  is a data-URL string with sane dimensions and that consumedShapeIds is an
 *  array of strings. Size cap: longer side ≤ FOG_BITMAP_MAX_DIM (4096) so a
 *  malicious / buggy GM can't push a multi-megapixel JSONB blob. */
function isValidBitmapPushPayload(p: FogBitmapPushPayload): boolean {
  if (!p.bitmap || typeof p.bitmap !== 'object') return false;
  const { data, w, h } = p.bitmap;
  if (typeof data !== 'string' || !data.startsWith('data:image/')) return false;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  if (Math.max(w, h) > FOG_BITMAP_MAX_DIM) return false;
  if (!Array.isArray(p.consumedShapeIds)) return false;
  if (p.consumedShapeIds.some((id) => typeof id !== 'string')) return false;
  return true;
}
import type { SceneAnnotationService } from '../../services/SceneAnnotationService.js';
import type { SceneService } from '../../services/SceneService.js';
import { parseSceneObject } from '../../lib/sceneObjectSchema.js';

/** Guards numeric transform fields (Sess 7).
 *  Mandatory: x, y, rotation. Optional (must be finite if present): width, height, scaleX, scaleY, fontSize.
 *  Extracted from the object:transform handler to keep cyclomatic complexity ≤ 10 (lint gate). */
function isFiniteOrAbsent(v: number | undefined): boolean {
  return v === undefined || Number.isFinite(v);
}

function isValidTransformPayload(p: SceneObjectTransformPayload): boolean {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.rotation) &&
    isFiniteOrAbsent(p.width) &&
    isFiniteOrAbsent(p.height) &&
    isFiniteOrAbsent(p.scaleX) &&
    isFiniteOrAbsent(p.scaleY) &&
    isFiniteOrAbsent(p.fontSize)
  );
}

/** Builds the TransformPayload for SceneAnnotationService by stripping undefined fields.
 *  Extracted to keep object:transform handler complexity ≤ 10 (Sess 7 lint gate). */
function buildTransformInput(p: SceneObjectTransformPayload): {
  x: number; y: number; rotation: number;
  width?: number; height?: number; scaleX?: number; scaleY?: number; fontSize?: number;
} {
  return {
    x: p.x,
    y: p.y,
    rotation: p.rotation,
    ...(p.width !== undefined ? { width: p.width } : {}),
    ...(p.height !== undefined ? { height: p.height } : {}),
    ...(p.scaleX !== undefined ? { scaleX: p.scaleX } : {}),
    ...(p.scaleY !== undefined ? { scaleY: p.scaleY } : {}),
    ...(p.fontSize !== undefined ? { fontSize: p.fontSize } : {}),
  };
}

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
    fogBitmapUpdate: (roomId: string, payload: FogBitmapUpdatePayload) => {
      io.to(roomId).emit('fog:bitmap-update', payload);
    },
  };
}

/** Broadcasts fog/annotation/snapshot events after a scene:flush to all clients
 *  except the sender (GM). Extracted from the handler to keep cyclomatic complexity ≤ 10. */
async function broadcastFlushResult(
  socket: TypedSocket,
  payload: SceneFlushPayload,
  shapes: FogShape[],
  drawService: import('../../services/DrawService.js').DrawService,
  sceneService: SceneService | undefined,
): Promise<void> {
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
    // drawService.persist() updated the in-memory cache so getAnnotations() returns
    // freshly normalized data without an extra DB round-trip.
    const persistedAnnotations = await drawService.getAnnotations(sceneId);
    socket.broadcast.to(roomId).emit('annotations:updated', { sceneId, annotations: persistedAnnotations });
  }
  // Deliver buffered scene-level mutations (background, grid, token positions)
  // to all OTHER clients on Done. scene:snapshot carries the full SceneDTO.
  if (sceneService) {
    const snapshot = await sceneService.getSnapshot(sceneId, socket.data.role, socket.data.userId);
    socket.broadcast.to(roomId).emit('scene:snapshot', { scene: snapshot });
  }
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

  // Sess 11 — GM-driven fog compaction. Once the per-scene shape count exceeds
  // FOG_COMPACTION_THRESHOLD, the GM client renders all shapes locally into a
  // PNG bitmap and pushes it via this event. The server replaces the consumed
  // shapes with the bitmap and broadcasts `fog:bitmap-update` to the room.
  socket.on('fog:bitmap-push', async (payload: FogBitmapPushPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (!isValidBitmapPushPayload(payload)) return;
      await drawService.applyBitmapPush(payload);
    } catch (err) {
      console.error('[Socket] fog:bitmap-push error:', err);
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
      await broadcastFlushResult(socket, payload, shapes, drawService, sceneService);
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

  // Sess 7.5 — generic upsert. Used by undo to restore deleted objects with the
  // same id (so initiative/asset references aren't broken). GM-only.
  socket.on('object:upsert', async (payload: SceneObjectUpsertPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      // Sess 8.3 — full structural validation via zod schema. Rejects payloads
      // with missing/wrong-shaped fields silently to avoid leaking internals to
      // a potentially malicious client.
      const parsed = parseSceneObject(payload.object);
      if (!parsed) return;
      await sceneAnnotationService.upsertObject(payload.sceneId, socket.data.role, parsed);
      io.to(payload.roomId).emit('object:upsert', { ...payload, object: parsed });
    } catch (err) {
      console.error('[Socket] object:upsert error:', err);
    }
  });

  socket.on('object:transform', async (payload: SceneObjectTransformPayload) => {
    try {
      if (socket.data.role !== 'GM') return;
      if (!sceneAnnotationService) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (!isValidTransformPayload(payload)) return;
      await sceneAnnotationService.transformObject(
        payload.sceneId,
        payload.objectId,
        socket.data.role,
        buildTransformInput(payload),
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

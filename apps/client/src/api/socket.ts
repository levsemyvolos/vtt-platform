import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Ack,
  SessionResyncPayload,
  TokenMovePayload,
  TokenDragPreviewPayload,
  DiceRollInput,
  ChatMessageInput,
  ChatDicePayload,
  ChatMessageDTO,
  SignalingPayload,
  AnnotationPingPayload,
  MeasurePayload,
  DrawStrokePayload,
  FogShapeAddPayload,
  FogShapeRemovePayload,
  FogBitmapPushPayload,
  SceneObjectMovePayload,
  SceneObjectDeletePayload,
  SceneObjectTransformPayload,
  SceneObjectLockPayload,
  SceneObjectZOrderPayload,
  SceneObjectDuplicatePayload,
  SceneObjectSetLayerPayload,
  SceneObjectSetVisibilityPayload,
  SceneObjectUpsertPayload,
  ModerationPayload,
} from '@vtt/shared';
import { tokenStore } from './tokenStore';
import { store } from '../store';
import { applySceneUpdate, applyTokenRollback, fogShapeAdded, fogShapeRemoved, clearFogMask, fogBitmapUpdated, moveSceneObjectOptimistic, removeSceneObject, applyAnnotationsUpdate, transformSceneObjectOptimistic, hydrateScene, lockSceneObject, setSceneObjectZIndex, appendSceneObject, setSceneObjectLayer, setSceneObjectVisibility, upsertToken } from '../store/scene';
import { appendChatMessage, appendDiceRoll } from '../store/chat';
import { hydrateInitiative } from '../store/initiative';
import { applyAudioPlay } from '../store/audio';
import { addPing, removePing, upsertMeasure, removeMeasure, upsertTokenDragPreview, removeTokenDragPreview } from '../store/annotations';
import { applyDrawStroke, clearDrawStrokes } from '../store/scene';
import { upsertRoomMember, removeRoomMember, removeRoom, applyRoomUpdate, startSession, clearRoom } from '../store/room';
import { setMicEnabled, setCameraEnabled } from '../store/media';
import { addToast } from '../store/toast';
import { bumpTab } from '../store/notifications';
import { upsertCharacter, removeCharacter } from '../store/characters';
import { upsertEntry, removeEntry } from '../store/journal';
import { playNotificationBeep } from '../utils/notificationSound';
import { enqueueDiceAnim } from '../store/diceAnim';
import i18n from 'i18next';
import { peerManagerRef } from '../infrastructure/webrtc/peerManagerRef';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedClientSocket | null = null;

const SERVER_URL = import.meta.env.VITE_API_URL ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
const ACK_TIMEOUT_MS = 5000;

/**
 * Singleton typed socket.io-client. JWT is read from tokenStore on each
 * (re)connect via the dynamic `auth` callback. The store-side reducers for
 * scene / chat / initiative slices are wired up here so any received frame
 * automatically dispatches to Redux.
 */
export function getSocket(): TypedClientSocket {
  if (socket) return socket;
  socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: (cb: (data: { token: string }) => void) => {
      cb({ token: tokenStore.getAccess() ?? '' });
    },
  });

  socket.on('connect_error', async (err) => {
    if (err.message === 'Invalid or expired access token' || err.message === 'Missing auth token') {
      try {
        const { refreshOnce } = await import('./apiFetch');
        const newToken = await refreshOnce();
        if (newToken && socket) socket.connect();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[Socket] Reconnect auth failure:', e);
      }
    }
  });

  socket.on('scene:updated', (payload) => {
    store.dispatch(applySceneUpdate(payload));
  });
  socket.on('object:move', (payload) => {
    store.dispatch(moveSceneObjectOptimistic({ objectId: payload.objectId, x: payload.x, y: payload.y }));
  });
  socket.on('object:delete', (payload) => {
    store.dispatch(removeSceneObject(payload.objectId));
  });
  socket.on('object:transform', (payload) => {
    store.dispatch(transformSceneObjectOptimistic({
      objectId: payload.objectId,
      x: payload.x,
      y: payload.y,
      rotation: payload.rotation,
      ...(payload.width !== undefined ? { width: payload.width } : {}),
      ...(payload.height !== undefined ? { height: payload.height } : {}),
      ...(payload.scaleX !== undefined ? { scaleX: payload.scaleX } : {}),
      ...(payload.scaleY !== undefined ? { scaleY: payload.scaleY } : {}),
      ...(payload.fontSize !== undefined ? { fontSize: payload.fontSize } : {}),
    }));
  });
  socket.on('object:lock', (payload) => {
    store.dispatch(lockSceneObject({
      objectId: payload.objectId,
      locked: payload.locked,
    }));
  });
  socket.on('object:zorder', (payload) => {
    store.dispatch(setSceneObjectZIndex({
      objectId: payload.objectId,
      direction: payload.direction,
    }));
  });
  socket.on('object:duplicated', (payload) => {
    store.dispatch(appendSceneObject(payload.object));
    // Sess 7.5 — only the originating user (whose currently-selected id matches
    // the source) should record undo for the duplicate; everyone else just sees
    // the broadcast. Heuristic: record if I'm GM (since duplicate is GM-only).
    const state = store.getState();
    const myUserId = state.session.currentUser?.id;
    const myMember = state.room.members.find((m) => m.userId === myUserId);
    if (myMember?.role === 'GM') {
      // Lazy import to avoid pulling the dispatcher into the socket bundle prematurely.
      void import('../store/undoDispatcher').then(({ recordUndo }) => {
        recordUndo({ kind: 'object_duplicate', clone: payload.object });
      });
    }
  });
  socket.on('object:upsert', (payload) => {
    // Sess 7.5 — undo of delete (or external full-object upsert) re-adds the
    // object with its original id. Reuses the appendSceneObject reducer which
    // is idempotent (replaces if id exists).
    store.dispatch(appendSceneObject(payload.object));
  });
  socket.on('object:set-layer', (payload) => {
    store.dispatch(setSceneObjectLayer({
      objectId: payload.objectId,
      layer: payload.layer,
    }));
  });
  socket.on('object:set-visibility', (payload) => {
    // Determine viewer role at dispatch time so the reducer can filter
    // gm-only objects from non-GM clients while keeping them on GM clients.
    const myUserId = store.getState().session.currentUser?.id;
    const myMember = store.getState().room.members.find((m) => m.userId === myUserId);
    const viewerIsGM = myMember?.role === 'GM';

    // Player flipping back from gm-only to 'all' needs the full object re-added,
    // because the Player's reducer removed it when visibility was set to gm-only.
    // The full object is included in the broadcast payload by the server (Sess 5.5).
    if (!viewerIsGM && payload.visibility === 'all' && payload.object) {
      store.dispatch(appendSceneObject(payload.object));
      return;
    }

    store.dispatch(setSceneObjectVisibility({
      objectId: payload.objectId,
      visibility: payload.visibility,
      viewerIsGM,
    }));
  });
  socket.on('token:rollback', (payload) => {
    store.dispatch(applyTokenRollback(payload));
  });
  // S4.2 — per-viewer token patch broadcast from PATCH /tokens/:id.
  socket.on('token:patched', (payload) => {
    store.dispatch(upsertToken(payload.token));
  });
  // Character real-time sync — broadcast from POST/PATCH/DELETE /characters.
  socket.on('character:created', (payload) => {
    store.dispatch(upsertCharacter(payload.character));
  });
  socket.on('character:updated', (payload) => {
    store.dispatch(upsertCharacter(payload.character));
  });
  socket.on('character:deleted', (payload) => {
    store.dispatch(removeCharacter(payload.characterId));
  });
  socket.on('chat:message', (msg) => {
    store.dispatch(appendChatMessage(msg));
    const state = store.getState();
    const myUserId = state.session.currentUser?.id;
    if (!myUserId) return;
    if (msg.userId === myUserId) return; // suppress self-notification
    if (msg.mode === 'whisper' && msg.recipientId === myUserId) {
      const fromName = state.room.members.find((m) => m.userId === msg.userId)?.name ?? msg.userId.slice(0, 6);
      store.dispatch(addToast('info', `Whisper from ${fromName}`));
      playNotificationBeep(state.notifications.soundMuted);
      if (state.notifications.activeTab !== 'chat') {
        store.dispatch(bumpTab('chat'));
      }
    }
  });
  socket.on('chat:dice', (payload) => {
    store.dispatch(appendDiceRoll(payload));
    store.dispatch(enqueueDiceAnim({
      expression: payload.expression,
      rolls: payload.rolls,
    }));
  });
  socket.on('initiative:updated', (payload) => {
    const prevState = store.getState();
    const prevCurrentTokenId = prevState.initiative.entries.find((e) => e.isCurrent)?.tokenId ?? null;
    store.dispatch(hydrateInitiative(payload));
    const next = store.getState();
    const nextCurrent = next.initiative.entries.find((e) => e.isCurrent);
    if (!nextCurrent) return;
    if (nextCurrent.tokenId === prevCurrentTokenId) return; // turn didn't change OR no token linked
    if (!nextCurrent.tokenId) return;
    const myUserId = next.session.currentUser?.id;
    if (!myUserId) return;
    const tokens = next.scene.current?.tokens ?? [];
    const token = tokens.find((tk) => tk.id === nextCurrent.tokenId);
    if (!token) return;
    if (token.assignedUserId === myUserId) {
      store.dispatch(addToast('info', 'Your turn'));
      playNotificationBeep(next.notifications.soundMuted);
      if (next.notifications.activeTab !== 'initiative') {
        store.dispatch(bumpTab('initiative'));
      }
    }
  });
  // Algorithm A4 trigger A вЂ” XOR fog-mask diff broadcast (В§2.17.5).
  socket.on('fog:shape-add', (payload) => {
    store.dispatch(fogShapeAdded(payload));
  });
  socket.on('fog:shape-remove', (payload) => {
    store.dispatch(fogShapeRemoved(payload));
  });
  socket.on('fog:clear', () => {
    store.dispatch(clearFogMask());
  });
  // Sess 11 — server-broadcast bitmap update after a successful GM compaction.
  // Replaces the consumed shapes with the new compacted bitmap; survives any
  // shapes added during the GM render window.
  socket.on('fog:bitmap-update', (payload) => {
    store.dispatch(fogBitmapUpdated(payload));
  });
  socket.on('annotations:updated', (payload) => {
    store.dispatch(applyAnnotationsUpdate(payload));
  });
  // Mini-C: full scene snapshot broadcast (background, grid mutations).
  // Sender's hydrateScene from PATCH response is idempotent; others get the update.
  // On scene:flush (Done), players receive background/grid changes staged during Edit Scene.
  socket.on('scene:snapshot', (payload) => {
    store.dispatch(hydrateScene(payload.scene));
  });
  // Note: server responds to `session:resync` only via the ack callback (see
  // `emitSessionResync` below вЂ” its caller in RoomLobby dispatches the hydrate
  // actions on the resolved payload). No server-pushed `session:resync` event
  // exists, so we deliberately do NOT register a listener here.
  // Р¤6 вЂ” universal `audio:play` event (broadcast from REST handlers and from
  // SceneService.onSceneActivated hook). Discriminated union by `action`.
  socket.on('audio:play', (payload) => {
    store.dispatch(applyAudioPlay(payload));
  });

  // Р¤3.4.1 вЂ” ephemeral ping marker; auto-removed after 3 s (В§2.16, table 2.14).
  socket.on('cursor:ping', (payload) => {
    store.dispatch(addPing(payload));
    setTimeout(() => {
      store.dispatch(removePing(payload.timestamp));
    }, 3000);
  });

  // Р¤3.4.2 вЂ” persistent free-draw stroke broadcast from server after GM persistence.
  socket.on('draw:stroke', (payload) => {
    store.dispatch(applyDrawStroke(payload));
  });
  socket.on('draw:clear', () => {
    store.dispatch(clearDrawStrokes());
  });

  // Wave 2.1 вЂ” real-time member roster update when a player joins via invite link.
  socket.on('room:member-joined', (payload) => {
    store.dispatch(upsertRoomMember(payload.member));
  });

  // Journal real-time sync — S11 T1 wires reducers.
  socket.on('journal:created', (payload) => { store.dispatch(upsertEntry(payload.entry)); });
  socket.on('journal:updated', (payload) => { store.dispatch(upsertEntry(payload.entry)); });
  socket.on('journal:deleted', (payload) => { store.dispatch(removeEntry(payload.entryId)); });

  // Wave 4.1 — room deleted by GM: remove from store; UI components react via selector.
  socket.on('room:deleted', (payload) => {
    store.dispatch(removeRoom(payload.roomId));
  });

  // GM starts session вЂ” all lobby subscribers transition to GameRoom.
  socket.on('room:started', () => {
    store.dispatch(startSession());
  });

  // GM renamed room or changed game system — sync to all clients without F5.
  socket.on('room:updated', (payload) => {
    store.dispatch(applyRoomUpdate(payload));
  });

  // Moderation: member kicked by GM.
  socket.on('room:member-removed', (payload) => {
    store.dispatch(removeRoomMember(payload.userId));
  });

  // Moderation: member demoted by GM — update their role in store.
  socket.on('room:member-updated', (payload) => {
    store.dispatch(upsertRoomMember(payload.member));
  });

  // Moderation: server-mute request from GM.
  socket.on('peer:mute-request', () => {
    peerManagerRef.current?.setMicEnabled(false);
    store.dispatch(setMicEnabled(false));
    store.dispatch(addToast('warning', i18n.t('gameroom:gmMutedYou')));
  });

  // Moderation: force cam off request from GM.
  socket.on('peer:cam-off-request', () => {
    peerManagerRef.current?.setCameraEnabled(false);
    store.dispatch(setCameraEnabled(false));
    store.dispatch(addToast('warning', i18n.t('gameroom:gmCamOff')));
  });

  // Moderation: kicked from session — hard-redirect to dashboard.
  // Hard navigate so PeerManager + Redux state are wiped cleanly.
  socket.on('room:kicked', () => {
    store.dispatch(addToast('error', i18n.t('gameroom:kickedFromRoom')));
    store.dispatch(clearRoom());
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 800);
  });

  // Ф3.4.3 — ephemeral ruler; upsert per-userId, auto-removed 5 s after last update.
  const measureTimers = new Map<string, ReturnType<typeof setTimeout>>();
  socket.on('measure:start', (payload) => {
    store.dispatch(upsertMeasure(payload));
    const existing = measureTimers.get(payload.userId);
    if (existing) clearTimeout(existing);
    measureTimers.set(
      payload.userId,
      setTimeout(() => {
        store.dispatch(removeMeasure(payload.userId));
        measureTimers.delete(payload.userId);
      }, 5000),
    );
  });

  // Sess 5.5 Mini-D — ephemeral token drag-preview; upsert per-tokenId, auto
  // cleared shortly after the last update so the ghost vanishes when the
  // dragger releases (final position arrives via `scene:updated`).
  const dragPreviewTimers = new Map<string, ReturnType<typeof setTimeout>>();
  socket.on('token:drag-preview', (payload) => {
    store.dispatch(upsertTokenDragPreview({
      tokenId: payload.tokenId,
      x: payload.x,
      y: payload.y,
    }));
    const existing = dragPreviewTimers.get(payload.tokenId);
    if (existing) clearTimeout(existing);
    dragPreviewTimers.set(
      payload.tokenId,
      setTimeout(() => {
        store.dispatch(removeTokenDragPreview(payload.tokenId));
        dragPreviewTimers.delete(payload.tokenId);
      }, 800),
    );
  });

  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Socket ack timeout')), ACK_TIMEOUT_MS),
    ),
  ]);
}

function unwrap<T>(response: Ack<T>): T {
  if (response.ok) return response.data;
  throw new Error(response.error.message);
}

// ---------- typed event helpers ----------

export function emitRoomJoin(roomId: string): Promise<{ joined: true }> {
  return withTimeout(
    new Promise<{ joined: true }>((resolve, reject) => {
      getSocket().emit('room:join', { roomId }, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
}

export function emitTokenMove(
  payload: TokenMovePayload,
): Promise<{ accepted: boolean; version: number }> {
  if (isEditingScene()) {
    // Edit-scene staging: GM's local moveTokenOptimistic dispatch already updated
    // Redux. Pretend OCC accepted to avoid the rollback path. The full token
    // positions snapshot is sent on Done via scene:flush → applyTokenSnapshot.
    return Promise.resolve({ accepted: true, version: 0 });
  }
  return withTimeout(
    new Promise<{ accepted: boolean; version: number }>((resolve, reject) => {
      getSocket().emit('token:move', payload, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
}

/**
 * Sess 5.5 Mini-D — fire-and-forget ephemeral drag preview. Server forwards to
 * OTHER sockets in the room only (sender does not receive its own broadcast).
 * Suppressed in edit-scene mode to keep staging consistent with token:move.
 */
export function emitTokenDragPreview(payload: TokenDragPreviewPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('token:drag-preview', payload);
}

export function emitDiceRoll(payload: DiceRollInput): Promise<ChatDicePayload> {
  return withTimeout(
    new Promise<ChatDicePayload>((resolve, reject) => {
      getSocket().emit('dice:roll', payload, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
}

export function emitChatMessage(payload: ChatMessageInput): Promise<ChatMessageDTO> {
  return withTimeout(
    new Promise<ChatMessageDTO>((resolve, reject) => {
      getSocket().emit('chat:message', payload, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
}

export function emitSignal(
  event: 'signal:offer' | 'signal:answer' | 'signal:ice',
  payload: SignalingPayload,
): void {
  // Fire-and-forget: server proxies as-is, no ack envelope (В§2.16.3).
  getSocket().emit(event, payload);
}

export type SignalListener = (
  event: 'signal:offer' | 'signal:answer' | 'signal:ice',
  payload: SignalingPayload,
) => void;

/** Subscribes to all three signaling events. Returns unsubscribe handle. */
export function onSignal(listener: SignalListener): () => void {
  const s = getSocket();
  const offer = (p: SignalingPayload): void => listener('signal:offer', p);
  const answer = (p: SignalingPayload): void => listener('signal:answer', p);
  const ice = (p: SignalingPayload): void => listener('signal:ice', p);
  s.on('signal:offer', offer);
  s.on('signal:answer', answer);
  s.on('signal:ice', ice);
  return () => {
    s.off('signal:offer', offer);
    s.off('signal:answer', answer);
    s.off('signal:ice', ice);
  };
}

export function emitSessionResync(roomId: string): Promise<SessionResyncPayload> {
  return withTimeout(
    new Promise<SessionResyncPayload>((resolve, reject) => {
      getSocket().emit('session:resync', { roomId }, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
}

/** Fire-and-forget ping marker (Р¤3.4.1). No ack вЂ” server broadcasts and forgets. */
export function emitAnnotationPing(payload: AnnotationPingPayload): void {
  getSocket().emit('cursor:ping', payload);
}

/** Fire-and-forget ruler update (Р¤3.4.3). No ack вЂ” server broadcasts and forgets. */
export function emitMeasure(payload: MeasurePayload): void {
  getSocket().emit('measure:start', payload);
}

/**
 * Edit Scene staging guard. While GM is in the Scene Editor, all real-time
 * scene mutations are buffered locally; they are committed to other clients
 * only when GM clicks Done (replayed via `flushEditedScene`). On Cancel the
 * client re-fetches and re-hydrates from the server, so suppressed actions
 * are simply discarded.
 */
function isEditingScene(): boolean {
  return store.getState().room.editingSceneId !== null;
}

/** Fire-and-forget draw stroke (Р¤3.4.2). GM-only вЂ” server enforces RBAC. */
export function emitDrawStroke(payload: DrawStrokePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('draw:stroke', payload);
}

/** Clears all strokes in the scene. GM-only. */
export function emitDrawClear(roomId: string, sceneId: string): void {
  if (isEditingScene()) return;
  getSocket().emit('draw:clear', { roomId, sceneId });
}

export function emitFogShapeAdd(payload: FogShapeAddPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('fog:shape-add', payload);
}

export function emitFogShapeRemove(payload: FogShapeRemovePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('fog:shape-remove', payload);
}

export function emitFogClear(roomId: string, sceneId: string): void {
  if (isEditingScene()) return;
  getSocket().emit('fog:clear', { roomId, sceneId });
}

/** Sess 11 — GM client pushes a compacted fog bitmap. The server replaces
 *  consumed shapes with the bitmap and broadcasts `fog:bitmap-update`. */
export function emitFogBitmapPush(payload: FogBitmapPushPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('fog:bitmap-push', payload);
}

export function emitObjectMove(payload: SceneObjectMovePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:move', payload);
}

export function emitObjectDelete(payload: SceneObjectDeletePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:delete', payload);
}

/**
 * Discrete transform broadcast — no throttle, fired once on transformEnd (Sess 2).
 * Server persists and re-broadcasts to room (including sender for idempotency).
 */
export function emitObjectTransform(payload: SceneObjectTransformPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:transform', payload);
}

/** Toggles the locked flag on a scene object (Sess 3 Mini-B). GM-only — server enforces RBAC. */
export function emitObjectLock(payload: SceneObjectLockPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:lock', payload);
}

/** Changes the zIndex of a scene object (Sess 3 Mini-B). GM-only — server enforces RBAC. */
export function emitObjectZOrder(payload: SceneObjectZOrderPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:zorder', payload);
}

/** Creates a deep copy of a scene object offset by (+20, +20) (Sess 3 Mini-B). GM-only — server enforces RBAC. */
export function emitObjectDuplicate(payload: SceneObjectDuplicatePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:duplicate', payload);
}

/** Changes the render layer of a scene object (Sess 5 Mini-B). GM-only — server enforces RBAC. */
export function emitObjectSetLayer(payload: SceneObjectSetLayerPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:set-layer', payload);
}

/** Changes the RBAC visibility of a scene object (Sess 5 Mini-B). GM-only — server enforces RBAC. */
export function emitObjectSetVisibility(payload: SceneObjectSetVisibilityPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:set-visibility', payload);
}

/** Insert-or-replace a scene object by id (Sess 7.5). Used by undo to restore
 *  deleted objects (or by future cross-client sync). GM-only — server enforces RBAC. */
export function emitObjectUpsert(payload: SceneObjectUpsertPayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:upsert', payload);
}

/**
 * Saves the local scene's fog shapes and draw annotations to the server and
 * syncs other clients. Uses `scene:flush` so the server broadcasts only to
 * OTHER clients — the GM already has the correct state locally and must not
 * receive a `fog:clear` bounce that would cause a visual flicker.
 */
export function emitModKick(payload: ModerationPayload): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const sock = getSocket();
    const timer = setTimeout(() => reject(new Error('Timeout')), ACK_TIMEOUT_MS);
    sock.emit('mod:kick', payload, (res) => {
      clearTimeout(timer);
      if (res.ok) resolve({ ok: true });
      else reject(new Error(res.error?.message ?? 'Failed'));
    });
  });
}

export function emitModDemote(payload: ModerationPayload): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const sock = getSocket();
    const timer = setTimeout(() => reject(new Error('Timeout')), ACK_TIMEOUT_MS);
    sock.emit('mod:demote', payload, (res) => {
      clearTimeout(timer);
      if (res.ok) resolve({ ok: true });
      else reject(new Error(res.error?.message ?? 'Failed'));
    });
  });
}

export function emitModServerMute(payload: ModerationPayload): void {
  getSocket().emit('mod:server-mute', payload);
}

export function emitModForceCamOff(payload: ModerationPayload): void {
  getSocket().emit('mod:force-cam-off', payload);
}

export function flushEditedScene(roomId: string, sceneId: string): void {
  const sock = getSocket();
  const state = store.getState();
  const scene = state.scene.current;
  if (!scene || scene.id !== sceneId) return;
  sock.emit('scene:flush', {
    roomId,
    sceneId,
    shapes: scene.fogShapes,
    annotations: scene.annotations,
    tokens: scene.tokens.map((t) => ({ id: t.id, x: t.x, y: t.y })),
  });
}

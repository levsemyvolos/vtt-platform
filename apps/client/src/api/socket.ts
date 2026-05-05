import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Ack,
  SessionResyncPayload,
  TokenMovePayload,
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
  SceneObjectMovePayload,
  SceneObjectDeletePayload,
  ModerationPayload,
} from '@vtt/shared';
import { tokenStore } from './tokenStore';
import { store } from '../store';
import { applySceneUpdate, applyTokenRollback, fogShapeAdded, fogShapeRemoved, clearFogMask, moveSceneObjectOptimistic, removeSceneObject, applyAnnotationsUpdate } from '../store/scene';
import { appendChatMessage, appendDiceRoll } from '../store/chat';
import { hydrateInitiative } from '../store/initiative';
import { applyAudioPlay } from '../store/audio';
import { addPing, removePing, upsertMeasure, removeMeasure } from '../store/annotations';
import { applyDrawStroke, clearDrawStrokes } from '../store/scene';
import { upsertRoomMember, removeRoomMember, removeRoom, applyRoomUpdate, startSession, clearRoom } from '../store/room';
import { setMicEnabled, setCameraEnabled } from '../store/media';
import { addToast } from '../store/toast';
import i18n from 'i18next';
import { peerManagerRef } from '../infrastructure/webrtc/peerManagerRef';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedClientSocket | null = null;

const SERVER_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
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
  socket.on('token:rollback', (payload) => {
    store.dispatch(applyTokenRollback(payload));
  });
  socket.on('chat:message', (msg) => {
    store.dispatch(appendChatMessage(msg));
  });
  socket.on('chat:dice', (payload) => {
    store.dispatch(appendDiceRoll(payload));
  });
  socket.on('initiative:updated', (payload) => {
    store.dispatch(hydrateInitiative(payload));
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
  socket.on('annotations:updated', (payload) => {
    store.dispatch(applyAnnotationsUpdate(payload));
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

  // Wave 4.1 вЂ” room deleted by GM: remove from store; UI components react via selector.
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
  return withTimeout(
    new Promise<{ accepted: boolean; version: number }>((resolve, reject) => {
      getSocket().emit('token:move', payload, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
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

export function emitObjectMove(payload: SceneObjectMovePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:move', payload);
}

export function emitObjectDelete(payload: SceneObjectDeletePayload): void {
  if (isEditingScene()) return;
  getSocket().emit('object:delete', payload);
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
  });
}

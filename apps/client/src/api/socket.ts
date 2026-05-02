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
} from '@vtt/shared';
import { tokenStore } from './tokenStore';
import { store } from '../store';
import { applySceneUpdate, applyTokenRollback, applyFogDiff } from '../store/scene';
import { appendChatMessage, appendDiceRoll } from '../store/chat';
import { hydrateInitiative } from '../store/initiative';
import { applyAudioPlay } from '../store/audio';
import { addPing, removePing, upsertMeasure, removeMeasure } from '../store/annotations';
import { applyDrawStroke, clearDrawStrokes } from '../store/scene';

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
    auth: (cb: (data: { token: string }) => void) => {
      cb({ token: tokenStore.getAccess() ?? '' });
    },
  });

  socket.on('scene:updated', (payload) => {
    store.dispatch(applySceneUpdate(payload));
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
  // Algorithm A4 trigger A — XOR fog-mask diff broadcast (§2.17.5).
  socket.on('fog:mask-diff', (payload) => {
    store.dispatch(applyFogDiff(payload));
  });
  // Note: server responds to `session:resync` only via the ack callback (see
  // `emitSessionResync` below — its caller in RoomLobby dispatches the hydrate
  // actions on the resolved payload). No server-pushed `session:resync` event
  // exists, so we deliberately do NOT register a listener here.
  // Ф6 — universal `audio:play` event (broadcast from REST handlers and from
  // SceneService.onSceneActivated hook). Discriminated union by `action`.
  socket.on('audio:play', (payload) => {
    store.dispatch(applyAudioPlay(payload));
  });

  // Ф3.4.1 — ephemeral ping marker; auto-removed after 3 s (§2.16, table 2.14).
  socket.on('cursor:ping', (payload) => {
    store.dispatch(addPing(payload));
    setTimeout(() => {
      store.dispatch(removePing(payload.timestamp));
    }, 3000);
  });

  // Ф3.4.2 — persistent free-draw stroke broadcast from server after GM persistence.
  socket.on('draw:stroke', (payload) => {
    store.dispatch(applyDrawStroke(payload));
  });
  socket.on('draw:clear', () => {
    store.dispatch(clearDrawStrokes());
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
  // Fire-and-forget: server proxies as-is, no ack envelope (§2.16.3).
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

/** Fire-and-forget ping marker (Ф3.4.1). No ack — server broadcasts and forgets. */
export function emitAnnotationPing(payload: AnnotationPingPayload): void {
  getSocket().emit('cursor:ping', payload);
}

/** Fire-and-forget ruler update (Ф3.4.3). No ack — server broadcasts and forgets. */
export function emitMeasure(payload: MeasurePayload): void {
  getSocket().emit('measure:start', payload);
}

/** Fire-and-forget draw stroke (Ф3.4.2). GM-only — server enforces RBAC. */
export function emitDrawStroke(payload: DrawStrokePayload): void {
  getSocket().emit('draw:stroke', payload);
}

/** Clears all strokes in the scene. GM-only. */
export function emitDrawClear(roomId: string, sceneId: string): void {
  getSocket().emit('draw:clear', { roomId, sceneId });
}

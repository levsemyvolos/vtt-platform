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
} from '@vtt/shared';
import { tokenStore } from './tokenStore';
import { store } from '../store';
import { applySceneUpdate, applyTokenRollback, hydrateScene } from '../store/scene';
import { appendChatMessage, hydrateChat, appendDiceRoll } from '../store/chat';
import { hydrateInitiative } from '../store/initiative';

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
  socket.on('initiative:updated', (entries) => {
    store.dispatch(hydrateInitiative(entries));
  });
  socket.on('session:resync', (payload: SessionResyncPayload) => {
    store.dispatch(hydrateScene(payload.scene));
    store.dispatch(hydrateChat(payload.messages));
    store.dispatch(hydrateInitiative(payload.initiatives));
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

export function emitSessionResync(roomId: string): Promise<SessionResyncPayload> {
  return withTimeout(
    new Promise<SessionResyncPayload>((resolve, reject) => {
      getSocket().emit('session:resync', { roomId }, (r) => {
        try { resolve(unwrap(r)); } catch (e) { reject(e); }
      });
    }),
  );
}

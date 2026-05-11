import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { Role, Ack } from '@vtt/shared';
import type { TypedServer, TypedSocket } from './types.js';
import { userRoom } from './types.js';
import type { SceneService } from '../services/SceneService.js';
import type { DiceService } from '../services/DiceService.js';
import type { ChatService } from '../services/ChatService.js';
import type { SessionResyncService } from '../services/SessionResyncService.js';
import type { InitiativeService } from '../services/InitiativeService.js';
import type { AnnotationService } from '../services/AnnotationService.js';
import type { DrawService } from '../services/DrawService.js';
import type { SceneAnnotationService } from '../services/SceneAnnotationService.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import { RoomAccessService } from '../services/RoomAccessService.js';
import { makeTokenMoveHandler, makeTokenDragPreviewHandler } from './handlers/token.js';
import { makeDiceRollHandler } from './handlers/dice.js';
import { makeChatMessageHandler } from './handlers/chat.js';
import { makeSessionResyncHandler } from './handlers/resync.js';
import { registerSignalingHandlers } from './handlers/signaling.js';
import { registerAnnotationHandlers } from './handlers/annotation.js';
import { registerDrawHandlers } from './handlers/draw.js';
import { registerModerationHandlers } from './handlers/moderation.js';

interface AccessPayload {
  sub: string;
  role: Role;
  sid: string;
  boundRoomId?: string;
}

export interface SocketDeps {
  sceneService: SceneService;
  diceService: DiceService;
  chatService: ChatService;
  resyncService: SessionResyncService;
  /**
   * Provided so future WSS handlers (e.g. live-edit of initiative from a
   * client widget) can reuse the same in-memory round counter as the REST
   * layer. Чат 7.1 itself broadcasts from REST handlers — see
   * `routes/initiative.ts`.
   */
  initiativeService: InitiativeService;
  annotationService: AnnotationService;
  drawService: DrawService;
  sceneAnnotationService?: SceneAnnotationService;
  rooms: RoomRepository;
  jwtSecret: string;
  corsOrigin: string;
}

/**
 * Builds a typed socket.io v4 Server bound to the existing http.Server,
 * applies JWT-handshake middleware, and registers per-socket handlers
 * for the events listed in §2.16.3 (table 2.14).
 *
 * Authentication: client sends `auth.token = accessJWT` in handshake. The
 * middleware verifies signature and attaches `socket.data` (typed via
 * `SocketData` from @vtt/shared/wss).
 *
 * Personal-room convention: every authenticated socket auto-joins
 * `user:${userId}` so unicast events (whisper, secret roll, signaling)
 * can target a user without tracking a userId→socketId map manually.
 */
export function buildSocketIo(httpServer: HttpServer, deps: SocketDeps): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    // credentials:true is required so the browser sends Cloud Run's
    // GAESA session-affinity cookie back on every polling request —
    // without it each XHR landed on a different instance, the socket.io
    // session map was empty, and the server replied 400 (sid unknown)
    // until the client gave up and re-handshook. The client side must
    // pair this with withCredentials:true (apps/client/src/api/socket.ts).
    cors: { origin: deps.corsOrigin, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
  });
  const roomAccess = new RoomAccessService(deps.rooms);

  io.use((socket: TypedSocket, next) => {
    const rawToken =
      typeof socket.handshake.auth['token'] === 'string'
        ? socket.handshake.auth['token']
        : '';
    if (!rawToken) {
      next(new Error('Missing auth token'));
      return;
    }
    try {
      const payload = jwt.verify(rawToken, deps.jwtSecret) as AccessPayload;
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.data.sessionId = payload.sid;
      if (payload.boundRoomId !== undefined) {
        socket.data.boundRoomId = payload.boundRoomId;
      }
      next();
    } catch {
      next(new Error('Invalid or expired access token'));
    }
  });

  io.on('connection', (socket: TypedSocket) => {
    void socket.join(userRoom(socket.data.userId));

    socket.on(
      'room:join',
      async (
        payload: { roomId: string },
        ack: (response: Ack<{ joined: true }>) => void,
      ) => {
        try {
          const accessInput = {
            roomId: payload.roomId,
            userId: socket.data.userId,
            jwtRole: socket.data.role,
            ...(socket.data.boundRoomId ? { boundRoomId: socket.data.boundRoomId } : {}),
          };
          const access = await roomAccess.resolve(accessInput);
          if (!access) {
            ack({ ok: false, error: { code: 403, message: 'Not a room member' } });
            return;
          }
          // GM is the owner; Players/Observers gain access via invite tokens
          // (validated at REST /rooms/:id/join endpoints in earlier verticals).
          // For Vertical 2 we accept any authenticated user — RBAC tightening
          // moves to Чат 7 along with full presence tracking.
          if (socket.data.roomId && socket.data.roomId !== payload.roomId) {
            await socket.leave(socket.data.roomId);
          }
          await socket.join(payload.roomId);
          socket.data.roomId = payload.roomId;
          socket.data.role = access.role;
          ack({ ok: true, data: { joined: true } });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          ack({ ok: false, error: { code: 500, message } });
        }
      },
    );

    socket.on('token:move', makeTokenMoveHandler(io, socket, deps.sceneService));
    socket.on('token:drag-preview', makeTokenDragPreviewHandler(socket, deps.sceneService));
    socket.on(
      'dice:roll',
      makeDiceRollHandler(io, socket, deps.diceService, deps.chatService, deps.rooms),
    );
    socket.on('chat:message', makeChatMessageHandler(io, socket, deps.chatService));
    socket.on('session:resync', makeSessionResyncHandler(socket, deps.resyncService));
    registerSignalingHandlers(io, socket, deps.rooms);
    registerAnnotationHandlers(socket, deps.annotationService);
    registerDrawHandlers(io, socket, deps.drawService, deps.sceneAnnotationService, deps.sceneService);
    registerModerationHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(
        `[ws] disconnect uid=${socket.data.userId} room=${socket.data.roomId ?? 'none'} reason=${reason}`,
      );
    });
  });

  return io;
}

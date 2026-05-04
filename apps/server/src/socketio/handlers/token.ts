import type { TokenMovePayload, Ack } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import type { SceneService } from '../../services/SceneService.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Handler for `token:move` — applies OCC algorithm A2 and broadcasts the result.
 *
 * Wire-up: registered per-socket inside the `connection` callback of the typed Server.
 * The socket's `data.roomId` must already be set (i.e. client has emitted `room:join`).
 *
 * Dispatch matrix from OccResult:
 *  - accepted  → broadcast `scene:updated` to room
 *  - rollback  → emit `token:rollback` to ONLY the requesting socket
 *  - discarded → ack with ok:false; no further dispatch
 */
export function makeTokenMoveHandler(
  io: TypedServer,
  socket: TypedSocket,
  sceneService: SceneService,
) {
  return async (
    payload: TokenMovePayload,
    ack: (response: Ack<{ accepted: boolean; version: number }>) => void,
  ): Promise<void> => {
    if (!socket.data.roomId) {
      ack({ ok: false, error: { code: 400, message: 'Not joined to any room' } });
      return;
    }
    try {
      const result = await sceneService.applyTokenMove(
        payload,
        socket.data.role,
        socket.data.userId,
      );
      if (result.kind === 'accepted') {
        const roomSockets = await io.in(socket.data.roomId).fetchSockets();
        const rawTokens = result.rawTokens ?? [];
        
        await Promise.all(
          roomSockets.map(async (recipient) => {
            const tokens = sceneService.projectTokens(
              rawTokens,
              recipient.data.role,
              recipient.data.userId,
            );
            recipient.emit('scene:updated', {
              sceneId: result.sceneUpdate.sceneId,
              version: result.sceneUpdate.version,
              tokens,
            });
          }),
        );
        ack({
          ok: true,
          data: { accepted: true, version: result.sceneUpdate.version },
        });
      } else if (result.kind === 'rollback') {
        socket.emit('token:rollback', result.rollback);
        ack({
          ok: true,
          data: { accepted: false, version: result.rollback.version },
        });
      } else {
        ack({ ok: false, error: { code: 409, message: result.reason } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const code = err instanceof HttpError ? err.status : 500;
      ack({ ok: false, error: { code, message } });
    }
  };
}

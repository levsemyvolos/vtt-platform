import type { Ack, SessionResyncPayload } from '@vtt/shared';
import type { TypedSocket } from '../types.js';
import type { SessionResyncService } from '../../services/SessionResyncService.js';

/**
 * Handler for `session:resync` (algorithm A3).
 *
 * Client triggers this immediately after a successful reconnect (or on initial
 * room join, for a uniform hydration path). The server responds via callback
 * ack with the aggregated SessionResyncPayload.
 */
export function makeSessionResyncHandler(
  socket: TypedSocket,
  resyncService: SessionResyncService,
) {
  return async (
    payload: { roomId: string },
    ack: (response: Ack<SessionResyncPayload>) => void,
  ): Promise<void> => {
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) {
      ack({ ok: false, error: { code: 403, message: 'Not joined to this room' } });
      return;
    }
    try {
      const data = await resyncService.buildResyncPayload(
        payload.roomId,
        socket.data.role,
        socket.data.userId,
      );
      ack({ ok: true, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      ack({ ok: false, error: { code: 500, message } });
    }
  };
}

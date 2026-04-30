import type { SignalingPayload } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';

/**
 * WebRTC signaling stubs (full implementation lands in Чат 6).
 *
 * Forwards `signal:offer`, `signal:answer`, `signal:ice` from the sender to
 * the targeted user's personal room. The server does not introspect SDP /
 * ICE payload — it is forwarded as-is (RFC 8829 model).
 */
export function registerSignalingHandlers(io: TypedServer, socket: TypedSocket): void {
  const forward = (event: 'signal:offer' | 'signal:answer' | 'signal:ice') =>
    (payload: SignalingPayload): void => {
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      io.to(userRoom(payload.toUserId)).emit(event, payload);
    };
  socket.on('signal:offer', forward('signal:offer'));
  socket.on('signal:answer', forward('signal:answer'));
  socket.on('signal:ice', forward('signal:ice'));
}

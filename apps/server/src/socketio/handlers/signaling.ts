import type { SignalingPayload } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';

type SignalingEvent = 'signal:offer' | 'signal:answer' | 'signal:ice';

/**
 * WebRTC signaling proxy (RFC 8829 model).
 *
 * The server forwards `signal:offer`, `signal:answer`, `signal:ice` between
 * two peers without inspecting or persisting SDP / ICE payloads. Routing is
 * done via the personal user-room convention (`user:${userId}`) — no
 * Map<userId, Socket> is required.
 *
 * Invariants:
 *   1. Sender must be authenticated and joined to `payload.roomId` (set in
 *      `room:join`); off-room signaling is dropped silently to prevent a
 *      forged room bridge.
 *   2. Sender cannot signal themselves — guards against echo loops.
 *   3. The SDP / ICE blob is opaque (`unknown`) and forwarded as-is.
 *
 * SFU / mesh ≥ 6 participants is out of scope for vertical 4 (see §2.13.4
 * note on observer-mesh ~6 ceiling). When that limit is reached, the
 * platform should switch to an SFU (e.g. mediasoup) — TODO below.
 */
export function registerSignalingHandlers(io: TypedServer, socket: TypedSocket): void {
  const forward = (event: SignalingEvent) =>
    (payload: SignalingPayload): void => {
      const senderId = socket.data.userId;
      if (!senderId) return;
      if (!socket.data.roomId || socket.data.roomId !== payload.roomId) return;
      if (payload.toUserId === senderId) return;

      // Authoritative sender identity — overrides anything the client put in.
      const enriched: SignalingPayload = { ...payload, fromUserId: senderId };
      // TODO (future): when room participants > ~6, route via SFU instead of
      // P2P mesh. Trigger: §2.13.4 «observer-mesh масштабується до ~6».
      io.to(userRoom(payload.toUserId)).emit(event, enriched);
    };

  socket.on('signal:offer', forward('signal:offer'));
  socket.on('signal:answer', forward('signal:answer'));
  socket.on('signal:ice', forward('signal:ice'));
}

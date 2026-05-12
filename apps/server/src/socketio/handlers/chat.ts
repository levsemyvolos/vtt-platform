import type { ChatMessageInput, ChatMessageDTO, Ack } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';
import type { ChatService } from '../../services/ChatService.js';
import type { RoomService } from '../../services/RoomService.js';

/**
 * Handler for `chat:message` — IC/OOC/whisper/observer-channel.
 *
 * Observer-isolation (§3): the channel is server-derived from `socket.data.role`
 * (set authoritatively at room:join time). Observer-authored messages get
 * channel='observer' and are unicast to all observers + GMs only; player/GM
 * messages keep the existing broadcast / whisper-unicast routing.
 */
export function makeChatMessageHandler(
  io: TypedServer,
  socket: TypedSocket,
  chatService: ChatService,
  roomService: RoomService,
) {
  return async (
    payload: ChatMessageInput,
    ack: (response: Ack<ChatMessageDTO>) => void,
  ): Promise<void> => {
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) {
      ack({ ok: false, error: { code: 403, message: 'Not joined to this room' } });
      return;
    }
    try {
      // Resolve room recipients (GM owner + observers) lazily — only the
      // observer-channel path needs them, but the cost is one query (already
      // used by REST member-listing) and keeps the service free of repo deps.
      const members = await roomService.getMembersProjection(payload.roomId);
      const gmUserIds = members.filter((m) => m.role === 'GM').map((m) => m.userId);
      const observerUserIds = members.filter((m) => m.role === 'Observer').map((m) => m.userId);

      const { message, delivery } = await chatService.createMessage(
        { userId: socket.data.userId, role: socket.data.role },
        payload,
        { gmUserIds, observerUserIds },
      );
      if (delivery.mode === 'broadcast') {
        io.to(payload.roomId).emit('chat:message', message);
      } else {
        for (const recipient of delivery.recipients) {
          io.to(userRoom(recipient)).emit('chat:message', message);
        }
      }
      ack({ ok: true, data: message });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      ack({ ok: false, error: { code: 500, message } });
    }
  };
}

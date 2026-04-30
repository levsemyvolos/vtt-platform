import type { ChatMessageInput, ChatMessageDTO, Ack } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';
import type { ChatService } from '../../services/ChatService.js';

/**
 * Handler for `chat:message` — IC/OOC/whisper. Persists via ChatService and
 * dispatches according to `delivery.mode`.
 *
 * Whisper unicast goes to both sender and recipient (so the sender sees their
 * own message in the chat log).
 */
export function makeChatMessageHandler(
  io: TypedServer,
  socket: TypedSocket,
  chatService: ChatService,
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
      const { message, delivery } = await chatService.createMessage(
        socket.data.userId,
        payload,
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

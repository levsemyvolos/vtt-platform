import type { DiceRollInput, ChatDicePayload, Ack } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';
import type { DiceService } from '../../services/DiceService.js';
import type { ChatService } from '../../services/ChatService.js';
import type { RoomRepository } from '../../repositories/RoomRepository.js';

/**
 * Handler for `dice:roll` (sequence diagram Process_View_DiceRoll).
 *
 * Pipeline: parse (A1) → roll (crypto.randomInt) → ChatService.recordDiceRoll
 * (which decides recipients) → dispatch.
 *
 * Secret rolls (mode === 'secret') are unicast to the sender + all GMs of the
 * room. Other modes broadcast to the room.
 */
export function makeDiceRollHandler(
  io: TypedServer,
  socket: TypedSocket,
  diceService: DiceService,
  chatService: ChatService,
  rooms: RoomRepository,
) {
  return async (
    payload: DiceRollInput,
    ack: (response: Ack<ChatDicePayload>) => void,
  ): Promise<void> => {
    if (!socket.data.roomId || socket.data.roomId !== payload.roomId) {
      ack({ ok: false, error: { code: 403, message: 'Not joined to this room' } });
      return;
    }
    const parsed = diceService.parseAndRoll(payload.expression, payload.mode);
    if (!parsed.ok) {
      ack({ ok: false, error: { code: 400, message: parsed.error } });
      return;
    }
    try {
      const room = await rooms.findById(payload.roomId);
      if (!room) {
        ack({ ok: false, error: { code: 404, message: 'Room not found' } });
        return;
      }
      const gmUserIds = [room.ownerId];
      const { payload: dicePayload, delivery } = await chatService.recordDiceRoll(
        socket.data.userId,
        payload.roomId,
        parsed.value,
        gmUserIds,
      );
      if (delivery.mode === 'broadcast') {
        io.to(payload.roomId).emit('chat:dice', dicePayload);
      } else {
        for (const recipient of delivery.recipients) {
          io.to(userRoom(recipient)).emit('chat:dice', dicePayload);
        }
      }
      ack({ ok: true, data: dicePayload });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      ack({ ok: false, error: { code: 500, message } });
    }
  };
}

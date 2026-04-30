import { randomUUID } from 'crypto';
import type { ChatMessage } from '@prisma/client';
import type {
  ChatMessageDTO,
  ChatDicePayload,
  DiceMode,
  ChatMessageInput,
} from '@vtt/shared';
import { ChatMessageRepository } from '../repositories/ChatMessageRepository.js';
import { HttpError } from '../lib/errors.js';
import { projectChatMessage } from './projections.js';
import type { DiceRollResult } from './DiceService.js';

/**
 * Routing decision for a chat / dice message.
 *  - broadcast : the dispatcher emits to the entire room.
 *  - unicast   : emit only to userIds in `recipients`.
 *
 * The service does NOT touch socket.io itself — handlers do dispatch.
 */
export interface ChatDelivery {
  mode: 'broadcast' | 'unicast';
  recipients: string[];
}

export class ChatService {
  constructor(private readonly messages: ChatMessageRepository) {}

  /**
   * Persists a chat message and computes its delivery plan based on `mode`.
   *
   * - normal/ic/ooc → broadcast to room.
   * - whisper       → unicast to [senderId, recipientId]; recipientId required.
   *
   * @param senderId author UUID (always populated for non-system messages)
   * @param input WSS payload from client
   */
  async createMessage(
    senderId: string,
    input: ChatMessageInput,
  ): Promise<{ message: ChatMessageDTO; delivery: ChatDelivery }> {
    if (input.mode === 'whisper' && !input.recipientId) {
      throw new HttpError(400, 'whisper requires recipientId');
    }
    if (input.mode === 'secret_roll') {
      throw new HttpError(400, 'secret_roll is reserved for dice rolls');
    }

    const created: ChatMessage = await this.messages.create({
      id: randomUUID(),
      room: { connect: { id: input.roomId } },
      sender: { connect: { id: senderId } },
      mode: input.mode,
      body: input.text,
      ...(input.recipientId
        ? { recipient: { connect: { id: input.recipientId } } }
        : {}),
    });

    const dto = projectChatMessage(created);
    const delivery: ChatDelivery =
      input.mode === 'whisper'
        ? {
            mode: 'unicast',
            recipients:
              input.recipientId && input.recipientId !== senderId
                ? [senderId, input.recipientId]
                : [senderId],
          }
        : { mode: 'broadcast', recipients: [] };

    return { message: dto, delivery };
  }

  /**
   * Persists a dice roll as ChatMessage (mode = normal | secret_roll) and
   * returns ChatDicePayload + delivery plan.
   *
   * Invariant (Незмінне рішення № 6 з PROJECT_BIBLE / §2.17.2):
   *   `mode === 'secret'` ⇒ delivery is unicast to [senderId, all GMs].
   *   The list of GM userIds must be supplied by the caller (handler holds
   *   the room → members map). The service stays free of socket.io coupling.
   *
   * @param senderId UUID of the rolling user
   * @param roomId Room UUID
   * @param result DiceService.parseAndRoll output
   * @param gmUserIds UUIDs of all GMs in the room (typically just the owner)
   */
  async recordDiceRoll(
    senderId: string,
    roomId: string,
    result: DiceRollResult,
    gmUserIds: string[],
  ): Promise<{ payload: ChatDicePayload; delivery: ChatDelivery }> {
    const isSecret = result.mode === 'secret';

    const created: ChatMessage = await this.messages.create({
      id: randomUUID(),
      room: { connect: { id: roomId } },
      sender: { connect: { id: senderId } },
      mode: isSecret ? 'secret_roll' : 'normal',
      body: result.expression,
      rollPayload: {
        expression: result.expression,
        total: result.total,
        rolls: result.rolls,
        mode: result.mode,
      },
    });

    const recipientsSet = new Set<string>([senderId, ...gmUserIds]);
    const payload: ChatDicePayload = {
      messageId: created.id,
      roomId,
      userId: senderId,
      expression: result.expression,
      mode: result.mode as DiceMode,
      total: result.total,
      rolls: result.rolls,
      secret: isSecret,
      recipients: isSecret ? Array.from(recipientsSet) : [],
      createdAt: created.createdAt.toISOString(),
    };

    const delivery: ChatDelivery = isSecret
      ? { mode: 'unicast', recipients: Array.from(recipientsSet) }
      : { mode: 'broadcast', recipients: [] };

    return { payload, delivery };
  }

  async listRecent(roomId: string, limit?: number): Promise<ChatMessageDTO[]> {
    const rows = await this.messages.listRecent(roomId, limit);
    return rows.map(projectChatMessage);
  }
}

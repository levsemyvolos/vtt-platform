import { randomUUID } from 'crypto';
import type { ChatMessage } from '@prisma/client';
import type {
  ChatMessageDTO,
  ChatDicePayload,
  ChatMessageInput,
  Role,
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

/** Sender context resolved at the socket layer (see chat-handler). */
export interface ChatSender {
  userId: string;
  /** Effective per-room role (RoomRepository.getRoleInRoom). */
  role: Role;
}

/**
 * Recipient lists supplied by the handler so the service stays free of repo
 * coupling. `gmUserIds` is typically `[room.ownerId]`; `observerUserIds` is
 * the list of RoomMember rows with role='Observer'.
 */
export interface RoomRecipients {
  gmUserIds: string[];
  observerUserIds: string[];
}

export class ChatService {
  constructor(private readonly messages: ChatMessageRepository) {}

  /**
   * Persists a chat message and computes its delivery plan.
   *
   * Routing (post Observer-isolation, §3):
   *   - sender.role === 'Observer'  → channel='observer', unicast to
   *                                     [sender, ...observers, ...gms]
   *   - otherwise (GM/Player)        → channel='public'
   *       - mode='whisper'  → unicast to [sender, recipient]
   *       - mode=normal/ic/ooc → broadcast to room
   *
   * Observers cannot whisper or roll secret dice. Their `mode` is preserved
   * for storage but does not affect routing — visibility is governed by
   * channel='observer' alone.
   */
  async createMessage(
    sender: ChatSender,
    input: ChatMessageInput,
    recipients: RoomRecipients,
  ): Promise<{ message: ChatMessageDTO; delivery: ChatDelivery }> {
    if (input.mode === 'secret_roll') {
      throw new HttpError(400, 'secret_roll is reserved for dice rolls');
    }
    if (sender.role !== 'Observer' && input.mode === 'whisper' && !input.recipientId) {
      throw new HttpError(400, 'whisper requires recipientId');
    }

    const channel: 'public' | 'observer' = sender.role === 'Observer' ? 'observer' : 'public';

    const created: ChatMessage = await this.messages.create({
      id: randomUUID(),
      room: { connect: { id: input.roomId } },
      sender: { connect: { id: sender.userId } },
      mode: input.mode,
      channel,
      body: input.text,
      ...(channel === 'public' && input.recipientId
        ? { recipient: { connect: { id: input.recipientId } } }
        : {}),
    });

    const dto = projectChatMessage(created);

    let delivery: ChatDelivery;
    if (channel === 'observer') {
      // Observer side-channel: visible to all observers + GMs (the author is
      // included via the observer set, but Set dedupes).
      const targetSet = new Set<string>([
        sender.userId,
        ...recipients.gmUserIds,
        ...recipients.observerUserIds,
      ]);
      delivery = { mode: 'unicast', recipients: Array.from(targetSet) };
    } else if (input.mode === 'whisper') {
      delivery = {
        mode: 'unicast',
        recipients:
          input.recipientId && input.recipientId !== sender.userId
            ? [sender.userId, input.recipientId]
            : [sender.userId],
      };
    } else {
      delivery = { mode: 'broadcast', recipients: [] };
    }

    return { message: dto, delivery };
  }

  /**
   * Persists a dice roll as ChatMessage (mode = normal | secret_roll) and
   * returns ChatDicePayload + delivery plan.
   *
   * Invariant (§2.17.2):
   *   `secret === true` ⇒ delivery is unicast to [senderId, all GMs].
   *
   * Observer-isolation (§3): observers do not have a dice tool, so dice rolls
   * always land on the `public` channel (server-side guard in the dice handler
   * rejects observer rolls before this method is reached).
   */
  async recordDiceRoll(
    senderId: string,
    roomId: string,
    result: DiceRollResult,
    secret: boolean,
    gmUserIds: string[],
  ): Promise<{ payload: ChatDicePayload; delivery: ChatDelivery }> {
    const isSecret = secret;

    const created: ChatMessage = await this.messages.create({
      id: randomUUID(),
      room: { connect: { id: roomId } },
      sender: { connect: { id: senderId } },
      mode: isSecret ? 'secret_roll' : 'normal',
      channel: 'public',
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
      mode: result.mode,
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

  async listRecent(roomId: string, limit?: number, viewerRole?: Role): Promise<ChatMessageDTO[]> {
    const rows = await this.messages.listRecent(
      roomId,
      limit,
      viewerRole ? { viewerRole } : {},
    );
    return rows.map(projectChatMessage);
  }
}

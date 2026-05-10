import type { ModerationPayload, Ack, RoomMemberDTO, Role } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';
import { prisma } from '../../lib/prisma.js';
import { can, type Action } from '../../auth/policy.js';

/**
 * Common gate for moderation actions: must be GM and operate inside the
 * socket's bound room. Returns true on pass; false (and reports via `ack` if
 * provided) on reject.
 */
function gate(
  socket: TypedSocket,
  action: Action,
  payload: ModerationPayload,
  ack?: (r: Ack<{ ok: boolean }>) => void,
): boolean {
  const role = socket.data.role as Role | undefined;
  if (!can(action, role)) {
    ack?.({ ok: false, error: { code: 403, message: 'GM only' } });
    return false;
  }
  if (socket.data.roomId !== payload.roomId) {
    ack?.({ ok: false, error: { code: 403, message: 'Not in room' } });
    return false;
  }
  return true;
}

function toDTO(m: {
  userId: string;
  role: string;
  user: { displayName: string };
}): RoomMemberDTO {
  return {
    userId: m.userId,
    role: m.role as RoomMemberDTO['role'],
    name: m.user.displayName,
  };
}

export function registerModerationHandlers(io: TypedServer, socket: TypedSocket): void {
  socket.on('mod:kick', async (payload: ModerationPayload, ack: (r: Ack<{ ok: boolean }>) => void) => {
    if (!gate(socket, 'mod:kick', payload, ack)) return;
    try {
      await prisma.roomMember.delete({
        where: { roomId_userId: { roomId: payload.roomId, userId: payload.targetUserId } },
      });

      // Force the kicked user's sockets out of the room *before* broadcasting
      // the membership change, so they receive `room:kicked` and can redirect
      // immediately without waiting for an F5. The hard `disconnect(true)`
      // closes the underlying transport so any in-flight handler that captured
      // socket.data into a local variable cannot continue acting on the room.
      const userSockets = await io.in(userRoom(payload.targetUserId)).fetchSockets();
      for (const s of userSockets) {
        if (s.data.roomId === payload.roomId) {
          s.emit('room:kicked', { roomId: payload.roomId });
          s.leave(payload.roomId);
          delete (s.data as { roomId?: string }).roomId;
          delete (s.data as { role?: unknown }).role;
          s.disconnect(true);
        }
      }

      io.to(payload.roomId).emit('room:member-removed', {
        roomId: payload.roomId,
        userId: payload.targetUserId,
      });
      ack({ ok: true, data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed';
      ack({ ok: false, error: { code: 500, message } });
    }
  });

  socket.on('mod:demote', async (payload: ModerationPayload, ack: (r: Ack<{ ok: boolean }>) => void) => {
    if (!gate(socket, 'mod:demote', payload, ack)) return;
    try {
      const updated = await prisma.roomMember.update({
        where: { roomId_userId: { roomId: payload.roomId, userId: payload.targetUserId } },
        data: { role: 'Observer' },
        include: { user: { select: { displayName: true } } },
      });
      io.to(payload.roomId).emit('room:member-updated', {
        roomId: payload.roomId,
        member: toDTO(updated),
      });
      ack({ ok: true, data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed';
      ack({ ok: false, error: { code: 500, message } });
    }
  });

  socket.on('mod:server-mute', (payload: ModerationPayload) => {
    if (!gate(socket, 'mod:server-mute', payload)) return;
    io.to(userRoom(payload.targetUserId)).emit('peer:mute-request', {
      userId: payload.targetUserId,
    });
  });

  socket.on('mod:force-cam-off', (payload: ModerationPayload) => {
    if (!gate(socket, 'mod:force-cam-off', payload)) return;
    io.to(userRoom(payload.targetUserId)).emit('peer:cam-off-request', {
      userId: payload.targetUserId,
    });
  });
}

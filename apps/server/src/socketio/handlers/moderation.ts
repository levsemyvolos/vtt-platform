import type { ModerationPayload, Ack, RoomMemberDTO } from '@vtt/shared';
import type { TypedSocket, TypedServer } from '../types.js';
import { userRoom } from '../types.js';
import { prisma } from '../../lib/prisma.js';

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
    if (socket.data.role !== 'GM') {
      ack({ ok: false, error: { code: 403, message: 'GM only' } });
      return;
    }
    if (socket.data.roomId !== payload.roomId) {
      ack({ ok: false, error: { code: 403, message: 'Not in room' } });
      return;
    }
    try {
      await prisma.roomMember.delete({
        where: { roomId_userId: { roomId: payload.roomId, userId: payload.targetUserId } },
      });

      // Force the kicked user's sockets out of the room *before* broadcasting
      // the membership change, so they receive `room:kicked` and can redirect
      // immediately without waiting for an F5.
      const userSockets = await io.in(userRoom(payload.targetUserId)).fetchSockets();
      for (const s of userSockets) {
        if (s.data.roomId === payload.roomId) {
          s.emit('room:kicked', { roomId: payload.roomId });
          s.leave(payload.roomId);
          delete (s.data as { roomId?: string }).roomId;
          delete (s.data as { role?: unknown }).role;
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
    if (socket.data.role !== 'GM') {
      ack({ ok: false, error: { code: 403, message: 'GM only' } });
      return;
    }
    if (socket.data.roomId !== payload.roomId) {
      ack({ ok: false, error: { code: 403, message: 'Not in room' } });
      return;
    }
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
    if (socket.data.role !== 'GM') return;
    if (socket.data.roomId !== payload.roomId) return;
    io.to(userRoom(payload.targetUserId)).emit('peer:mute-request', {
      userId: payload.targetUserId,
    });
  });

  socket.on('mod:force-cam-off', (payload: ModerationPayload) => {
    if (socket.data.role !== 'GM') return;
    if (socket.data.roomId !== payload.roomId) return;
    io.to(userRoom(payload.targetUserId)).emit('peer:cam-off-request', {
      userId: payload.targetUserId,
    });
  });
}

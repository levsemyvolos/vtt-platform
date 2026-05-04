import type { Role } from '@vtt/shared';
import type { RoomRepository } from '../repositories/RoomRepository.js';

export interface RoomAccessInput {
  roomId: string;
  userId: string;
  jwtRole: Role;
  boundRoomId?: string;
}

export interface RoomAccess {
  roomId: string;
  userId: string;
  role: Role;
}

export class RoomAccessService {
  constructor(private readonly rooms: RoomRepository) {}

  async resolve(input: RoomAccessInput): Promise<RoomAccess | null> {
    const role = await this.rooms.getRoleInRoom(
      input.roomId,
      input.userId,
      input.jwtRole,
      input.boundRoomId,
    );
    if (!role) return null;
    return {
      roomId: input.roomId,
      userId: input.userId,
      role,
    };
  }
}

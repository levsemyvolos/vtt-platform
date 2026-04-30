import type { RoomMembersResponse } from '@vtt/shared';
import { apiFetch } from './apiFetch';

/** GET /rooms/:id/members — R6 γ-variant: gm + players resolved via Character.ownerId. */
export function getRoomMembers(roomId: string): Promise<RoomMembersResponse> {
  return apiFetch<RoomMembersResponse>(`/api/rooms/${roomId}/members`);
}

import type { Role } from '@vtt/shared';

/**
 * Single source of truth for the per-room RBAC matrix described in
 * `PROJECT_BIBLE.md` §2.18.2. Express middleware (`requireRole`,
 * `requireRoomGM`, `requireBoundRoom`) and Socket.IO handlers must consult
 * `can()` instead of hard-coding role comparisons, so that any future change
 * to the matrix has exactly one edit site.
 *
 * Action vocabulary mirrors the documented operations; new actions added here
 * MUST be reflected in §2.18.2 of the BIBLE in the same change.
 */
export type Action =
  | 'room:create'
  | 'room:update'
  | 'room:delete'
  | 'room:start'
  | 'room:join'
  | 'scene:manage'
  | 'token:move'
  | 'chat:message'
  | 'cursor:ping'
  | 'mod:kick'
  | 'mod:demote'
  | 'mod:server-mute'
  | 'mod:force-cam-off'
  | 'ai:image'
  | 'ai:music'
  | 'ai:prompt-assist'
  | 'character:read-own'
  | 'character:write-own';

export const POLICY: Record<Action, ReadonlyArray<Role>> = {
  'room:create': ['GM', 'Player'],
  'room:update': ['GM', 'Player'],
  'room:delete': ['GM', 'Player'],
  'room:start': ['GM', 'Player'],
  'room:join': ['GM', 'Player'],
  'scene:manage': ['GM'],
  'token:move': ['GM', 'Player'],
  'chat:message': ['GM', 'Player', 'Observer'],
  'cursor:ping': ['GM', 'Player', 'Observer'],
  'mod:kick': ['GM'],
  'mod:demote': ['GM'],
  'mod:server-mute': ['GM'],
  'mod:force-cam-off': ['GM'],
  'ai:image': ['GM'],
  'ai:music': ['GM'],
  'ai:prompt-assist': ['GM'],
  'character:read-own': ['GM', 'Player'],
  'character:write-own': ['GM', 'Player'],
} as const;

export function can(action: Action, role: Role | undefined): boolean {
  if (!role) return false;
  return POLICY[action].includes(role);
}

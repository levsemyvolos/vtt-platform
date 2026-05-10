import { describe, expect, it } from 'vitest';
import type { Role } from '@vtt/shared';
import { POLICY, can, type Action } from '../../src/auth/policy.js';

/**
 * The policy table is the single source of truth for the §2.18.2 RBAC matrix.
 * These tests guard against silent regressions: any future edit must be
 * accompanied by a deliberate test update (and a §2.18.2 BIBLE update).
 */
describe('auth/policy — RBAC matrix', () => {
  const allRoles: Role[] = ['GM', 'Player', 'Observer'];

  it.each(Object.keys(POLICY) as Action[])(
    'GM is permitted for every documented action (%s)',
    (action) => {
      expect(can(action, 'GM')).toBe(true);
    },
  );

  it('Observer is restricted to read-only collaborative actions', () => {
    const observerActions = (Object.keys(POLICY) as Action[]).filter((a) =>
      can(a, 'Observer'),
    );
    expect(observerActions.sort()).toEqual(['chat:message', 'cursor:ping'].sort());
  });

  it('Player cannot trigger AI generation actions', () => {
    expect(can('ai:image', 'Player')).toBe(false);
    expect(can('ai:music', 'Player')).toBe(false);
    expect(can('ai:prompt-assist', 'Player')).toBe(false);
  });

  it('Player cannot moderate', () => {
    expect(can('mod:kick', 'Player')).toBe(false);
    expect(can('mod:demote', 'Player')).toBe(false);
    expect(can('mod:server-mute', 'Player')).toBe(false);
    expect(can('mod:force-cam-off', 'Player')).toBe(false);
  });

  it('Observer is denied any moderation or AI action', () => {
    const denied: Action[] = [
      'mod:kick',
      'mod:demote',
      'mod:server-mute',
      'mod:force-cam-off',
      'ai:image',
      'ai:music',
      'ai:prompt-assist',
      'token:move',
      'scene:manage',
      'character:write-own',
      'room:create',
      'room:delete',
    ];
    for (const action of denied) {
      expect(can(action, 'Observer')).toBe(false);
    }
  });

  it('Player and GM can join rooms via invite (room:join)', () => {
    expect(can('room:join', 'GM')).toBe(true);
    expect(can('room:join', 'Player')).toBe(true);
    expect(can('room:join', 'Observer')).toBe(false);
  });

  it('chat:message and cursor:ping are open to every role', () => {
    for (const role of allRoles) {
      expect(can('chat:message', role)).toBe(true);
      expect(can('cursor:ping', role)).toBe(true);
    }
  });

  it('returns false for an undefined role (defensive — pre-room:join socket)', () => {
    expect(can('mod:kick', undefined)).toBe(false);
    expect(can('chat:message', undefined)).toBe(false);
  });

  it('every action lists at least one role (no orphaned policy rows)', () => {
    for (const action of Object.keys(POLICY) as Action[]) {
      expect(POLICY[action].length).toBeGreaterThan(0);
    }
  });
});

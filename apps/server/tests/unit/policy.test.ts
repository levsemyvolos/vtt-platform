import { describe, expect, it } from 'vitest';
import type { Role } from '@vtt/shared';
import { POLICY, can, type Action } from '../../src/auth/policy.js';

/**
 * The policy table is the single source of truth for the RBAC matrix.
 * These tests guard against silent regressions: any future edit must be
 * accompanied by a deliberate test update.
 */
describe('auth/policy — RBAC matrix', () => {
  const allRoles: Role[] = ['GM', 'Player', 'Observer'];

  it.each(Object.keys(POLICY) as Action[])(
    'GM is permitted for every documented action (%s)',
    (action) => {
      expect(can(action, 'GM')).toBe(true);
    },
  );

  it('Observer is restricted to chat:message and webrtc:signal — §3 Observer isolation', () => {
    // Observer-isolation: cursor:ping and dice:roll remain GM/Player only.
    // webrtc:signal is re-opened for Observer so non-Observer peers can initiate
    // offers and Observer can send ICE/answers back (receive-only; getUserMedia
    // is skipped client-side in VideoCall.tsx).
    // Observer-authored chat is server-routed onto the `observer` channel
    // (visible only to Observers + GM); see ChatService.
    const observerActions = (Object.keys(POLICY) as Action[]).filter((a) =>
      can(a, 'Observer'),
    );
    expect(observerActions.sort()).toEqual(['chat:message', 'webrtc:signal']);
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

  it('Observer is denied moderation, AI, dice, and cursor:ping actions', () => {
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
      // Observer-isolation §3:
      'cursor:ping',
      'dice:roll',
      // webrtc:signal REMOVED — Observer receives WebRTC (send answers/ICE back);
      // getUserMedia is skipped client-side so Observer never transmits media.
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

  it('chat:message is open to every role; cursor:ping is GM/Player only', () => {
    for (const role of allRoles) {
      expect(can('chat:message', role)).toBe(true);
    }
    // cursor:ping changed to GM/Player only as part of §3 Observer isolation.
    expect(can('cursor:ping', 'GM')).toBe(true);
    expect(can('cursor:ping', 'Player')).toBe(true);
    expect(can('cursor:ping', 'Observer')).toBe(false);
  });

  it('dice:roll is GM/Player only — Observer cannot roll dice', () => {
    expect(can('dice:roll', 'GM')).toBe(true);
    expect(can('dice:roll', 'Player')).toBe(true);
    expect(can('dice:roll', 'Observer')).toBe(false);
  });

  it('webrtc:signal is open to every role — Observer receives (no own transmission, client-side guard)', () => {
    expect(can('webrtc:signal', 'GM')).toBe(true);
    expect(can('webrtc:signal', 'Player')).toBe(true);
    expect(can('webrtc:signal', 'Observer')).toBe(true);
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

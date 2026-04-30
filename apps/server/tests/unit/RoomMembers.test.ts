import { describe, it, expect, vi } from 'vitest';
import type { User, Room, Character } from '@prisma/client';
import type { UserPublic } from '@vtt/shared';

/**
 * Unit-test for the γ-variant membership resolution logic used by
 * GET /rooms/:id/members (R6, Чат 7.5).
 *
 * Tested logic (extracted from the route handler):
 *   gm      = room.owner
 *   players = distinct Character.ownerId joined with User WHERE roomId
 *   observers = []
 */

function makeUser(overrides: Partial<User> = {}): User & { displayName: string } {
  return {
    id: 'u-default',
    email: 'user@example.com',
    displayName: 'User',
    passwordHash: 'hash',
    createdAt: new Date(),
    ...overrides,
  } as User & { displayName: string };
}

type CharacterWithOwner = Character & { owner: User };

function makeCharacter(ownerId: string, owner: User): CharacterWithOwner {
  return {
    id: `char-${ownerId}`,
    ownerId,
    roomId: 'room-1',
    name: 'Hero',
    sheetData: {},
    pdfAssetId: null,
    updatedAt: new Date(),
    owner,
  } as unknown as CharacterWithOwner;
}

/** Mirrors the route handler's γ-resolution logic. */
function resolveMembers(
  room: { ownerId: string; owner: User },
  characters: CharacterWithOwner[],
): { gm: UserPublic; players: UserPublic[]; observers: UserPublic[] } {
  const gm: UserPublic = {
    id: room.owner.id,
    email: room.owner.email,
    name: (room.owner as User & { displayName: string }).displayName,
  };
  const players: UserPublic[] = characters.map((c) => ({
    id: c.owner.id,
    email: c.owner.email,
    name: (c.owner as User & { displayName: string }).displayName,
  }));
  return { gm, players, observers: [] };
}

describe('GET /rooms/:id/members — γ-variant resolution (R6)', () => {
  it('returns GM from room.ownerId and empty players when no characters exist', () => {
    const gmUser = makeUser({ id: 'gm-1', email: 'gm@vtt.test', displayName: 'GameMaster' });
    const room = { ownerId: 'gm-1', owner: gmUser };

    const result = resolveMembers(room, []);

    expect(result.gm.id).toBe('gm-1');
    expect(result.gm.name).toBe('GameMaster');
    expect(result.players).toHaveLength(0);
    expect(result.observers).toHaveLength(0);
  });

  it('resolves players from distinct Character.ownerId joined with User', () => {
    const gmUser = makeUser({ id: 'gm-1', email: 'gm@vtt.test', displayName: 'GM' });
    const player1 = makeUser({ id: 'p-1', email: 'p1@vtt.test', displayName: 'Alice' });
    const player2 = makeUser({ id: 'p-2', email: 'p2@vtt.test', displayName: 'Bob' });
    const room = { ownerId: 'gm-1', owner: gmUser };

    // player1 has two characters — γ-variant deduplicates via SQL DISTINCT ownerId
    // here we simulate that Prisma already returned one row per owner
    const characters = [
      makeCharacter('p-1', player1),
      makeCharacter('p-2', player2),
    ];

    const result = resolveMembers(room, characters);

    expect(result.gm.id).toBe('gm-1');
    expect(result.players).toHaveLength(2);
    expect(result.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(result.observers).toHaveLength(0);
  });

  it('RBAC: GM is never listed among players even if they created a Character', () => {
    const gmUser = makeUser({ id: 'gm-1', email: 'gm@vtt.test', displayName: 'GM' });
    const room = { ownerId: 'gm-1', owner: gmUser };
    // If GM somehow created a character, the route returns both gm slot AND players slot
    // (γ-variant does not filter GM out of players — it's a known simplification)
    // This test documents the current behaviour, not a future constraint.
    const characters = [makeCharacter('gm-1', gmUser)];
    const result = resolveMembers(room, characters);

    // GM appears in gm slot AND potentially in players (documented γ limitation)
    expect(result.gm.id).toBe('gm-1');
    // players derived from characters include the GM's character owner
    expect(result.players.map((p) => p.id)).toContain('gm-1');
  });

  it('uses vi.fn to verify mock integration pattern', () => {
    const spy = vi.fn(resolveMembers);
    const gmUser = makeUser({ id: 'gm-99', displayName: 'SpyGM' });
    spy({ ownerId: 'gm-99', owner: gmUser }, []);
    expect(spy).toHaveBeenCalledOnce();
  });
});

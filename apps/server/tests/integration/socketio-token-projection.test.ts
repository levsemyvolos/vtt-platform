import { describe, it, expect } from 'vitest';
import { projectToken } from '../../src/services/projections.js';
import type { Token } from '@prisma/client';

const GM_ID = 'gm-001';
const PLAYER_ID = 'player-001';

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 'token-' + Math.random().toString(36).slice(2, 9),
    sceneId: 'scene-1',
    name: 'Test Token',
    imageUrl: '',
    imageAssetId: null,
    x: 0, y: 0, width: 1, height: 1, rotation: 0, scale: 1,
    isHidden: false,
    assignedUserId: null,
    hp: null, maxHp: null, statusMarkers: null, color: null,
    type: 'creature',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

describe('Token Projection Tests', () => {
  it('GM sees hidden token', () => {
    const token = makeToken({ id: 'tok-hidden', isHidden: true });
    expect(projectToken(token, 'GM', GM_ID)?.id).toBe('tok-hidden');
  });

  it('Player does NOT see hidden token', () => {
    const token = makeToken({ id: 'tok-hidden', isHidden: true });
    expect(projectToken(token, 'Player', PLAYER_ID)).toBeNull();
  });

  it('Owner sees assigned token details', () => {
    const token = makeToken({
      id: 'tok-assigned',
      assignedUserId: PLAYER_ID,
      hp: 10,
      maxHp: 20,
    });
    const result = projectToken(token, 'Player', PLAYER_ID);
    expect(result?.hp).toBe(10);
    expect(result?.maxHp).toBe(20);
  });

  it('Non-owner does NOT see private token fields', () => {
    const token = makeToken({
      id: 'tok-assigned',
      assignedUserId: PLAYER_ID,
      hp: 10,
      maxHp: 20,
    });
    const result = projectToken(token, 'Player', 'other-player');
    expect(result?.hp).toBeUndefined();
    expect(result?.maxHp).toBeUndefined();
  });

  it('GM always sees private token fields', () => {
    const token = makeToken({
      id: 'tok-assigned',
      assignedUserId: PLAYER_ID,
      hp: 10,
      maxHp: 20,
    });
    const result = projectToken(token, 'GM', GM_ID);
    expect(result?.hp).toBe(10);
  });

  it('Hidden token is completely filtered from non-GM', () => {
    const token = makeToken({ id: 'tok-secret', isHidden: true });
    expect(projectToken(token, 'Player', PLAYER_ID)).toBeNull();
  });
});

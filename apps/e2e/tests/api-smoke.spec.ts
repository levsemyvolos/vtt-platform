/**
 * API Smoke Tests: Multi-User VTT Platform
 * Tests critical REST API endpoints for MVP verification
 */
import { test, expect, APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://localhost:4000';

interface TestState {
  gmToken: string;
  playerToken: string;
  roomId: string;
  request: APIRequestContext;
}

let state: TestState;

test.describe.configure({ mode: 'serial' });

test.describe('API Smoke Tests - MVP Core', () => {
  test.beforeAll(async ({ playwright }) => {
    state = {
      gmToken: '',
      playerToken: '',
      roomId: '',
      request: await playwright.request.newContext(),
    };
  });

  test.afterAll(async () => {
    await state.request.dispose();
  });

  test('✅ 1: Register GM', async () => {
    const email = `gm_${Date.now()}@test.local`;
    const res = await state.request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: 'testPass123', name: 'GM' },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    state.gmToken = data.accessToken;
    expect(state.gmToken).toBeTruthy();
  });

  test('✅ 2: Register Player', async () => {
    const email = `player_${Date.now()}@test.local`;
    const res = await state.request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: 'testPass123', name: 'Player' },
    });
    expect(res.status()).toBe(201);
    state.playerToken = (await res.json()).accessToken;
  });

  test('✅ 3: GM creates room', async () => {
    const res = await state.request.post(`${BASE_URL}/rooms`, {
      headers: { Authorization: `Bearer ${state.gmToken}` },
      data: { name: 'MVP Room', gameSystem: 'D&D 5e' },
    });
    expect([200, 201]).toContain(res.status());
    state.roomId = (await res.json()).id;
  });

  test('✅ 4: GM accesses own room', async () => {
    const res = await state.request.get(`${BASE_URL}/rooms/${state.roomId}`, {
      headers: { Authorization: `Bearer ${state.gmToken}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('✅ 5: No auth returns 401', async () => {
    const res = await state.request.get(`${BASE_URL}/rooms`);
    expect(res.status()).toBe(401);
  });

  test('✅ 6: Invalid token returns 401', async () => {
    const res = await state.request.get(`${BASE_URL}/rooms`, {
      headers: { Authorization: 'Bearer fake' },
    });
    expect(res.status()).toBe(401);
  });

  test('✅ 7: Player can list rooms', async () => {
    const res = await state.request.get(`${BASE_URL}/rooms`, {
      headers: { Authorization: `Bearer ${state.playerToken}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('✅ 8: Room has owner', async () => {
    const res = await state.request.get(`${BASE_URL}/rooms/${state.roomId}`, {
      headers: { Authorization: `Bearer ${state.gmToken}` },
    });
    const room = await res.json();
    expect(room.ownerId).toBeTruthy();
  });
});

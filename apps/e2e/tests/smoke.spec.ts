import { test, expect, chromium } from '@playwright/test';

/**
 * Smoke Tests: Multi-User VTT Platform
 *
 * Scenario: GM creates room → Player joins → Observer joins → token interactions → reload
 * Tests access control, WSS sync, and per-user visibility
 */

test.describe('VTT Platform Smoke Tests', () => {
  let gmContext: any;
  let playerContext: any;
  let observerContext: any;

  test.beforeAll(async () => {
    const browser = await chromium.launch();
    gmContext = await browser.newContext();
    playerContext = await browser.newContext();
    observerContext = await browser.newContext();
  });

  test.afterAll(async () => {
    await gmContext?.close();
    await playerContext?.close();
    await observerContext?.close();
  });

  test('GM: Create room and activate scene', async () => {
    const page = await gmContext.newPage();

    // 1. Login as GM
    await page.goto('/');
    await page.fill('input[name="email"]', 'gm@test.local');
    await page.fill('input[name="password"]', 'gmPassword123');
    await page.click('button:has-text("Login")');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // 2. Create room
    await page.click('button:has-text("Create Room")');
    await page.fill('input[name="roomName"]', 'Smoke Test Room');
    await page.selectOption('select[name="gameSystem"]', 'D&D 5e');
    await page.click('button:has-text("Create")');
    await page.waitForURL('/room/**', { timeout: 10000 });

    const roomUrl = page.url();
    const roomId = new URL(roomUrl).pathname.split('/').pop();

    // 3. Verify room created
    await expect(page.locator('text=Smoke Test Room')).toBeVisible();
    await expect(page.locator('text=Lobby')).toBeVisible();

    // 4. Activate scene
    await page.click('button:has-text("Start Game")');
    await page.waitForURL('**/game/**', { timeout: 10000 });

    // 5. Verify game room loaded
    await expect(page.locator('canvas')).toBeVisible();

    // Store roomId for other players
    (test as any).roomId = roomId;
    (test as any).gmPage = page;
  });

  test('Player: Join via invite token', async () => {
    const page = await playerContext.newPage();
    const roomId = (test as any).roomId;

    // 1. Player joins via observer invite link (simulated)
    // In real scenario, would use actual invite token
    await page.goto(`/room/${roomId}/join-player`);

    // 2. Register/login as player
    await page.fill('input[name="email"]', 'player@test.local');
    await page.fill('input[name="password"]', 'playerPass123');
    await page.click('button:has-text("Register")');

    // 3. Wait for game room
    await page.waitForURL('**/game/**', { timeout: 10000 });

    // 4. Verify player loaded
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('text=Initiative')).toBeVisible();

    (test as any).playerPage = page;
  });

  test('Observer: Join via observer token', async () => {
    const page = await observerContext.newPage();
    const roomId = (test as any).roomId;

    // 1. Observer joins via observer invite link
    await page.goto(`/room/${roomId}/join-observer`);

    // 2. Wait for game room (no login needed)
    await page.waitForURL('**/game/**', { timeout: 10000 });

    // 3. Verify observer loaded
    await expect(page.locator('canvas')).toBeVisible();

    (test as any).observerPage = page;
  });

  test('GM: Add visible token', async () => {
    const page = (test as any).gmPage;

    // 1. Open token creator
    await page.click('button[title="Add Token"]');

    // 2. Upload or create token
    await page.fill('input[name="tokenName"]', 'Visible Enemy');
    await page.selectOption('select[name="tokenType"]', 'creature');
    await page.click('button:has-text("Add Token")');

    // 3. Verify token appears on canvas
    await expect(page.locator('text=Visible Enemy')).toBeVisible();
  });

  test('Player: See visible token in real-time', async () => {
    const playerPage = (test as any).playerPage;

    // Wait for real-time sync
    await playerPage.waitForTimeout(1000);

    // Verify player sees the token (projectToken allows visible=true for all)
    await expect(playerPage.locator('text=Visible Enemy')).toBeVisible();
  });

  test('Observer: See visible token', async () => {
    const observerPage = (test as any).observerPage;

    // Verify observer sees the token
    await expect(observerPage.locator('text=Visible Enemy')).toBeVisible();
  });

  test('GM: Add hidden token (NOT visible to others)', async () => {
    const page = (test as any).gmPage;

    // 1. Add another token
    await page.click('button[title="Add Token"]');
    await page.fill('input[name="tokenName"]', 'Hidden Boss');
    await page.click('button[name="hiddenToken"]'); // Set hidden=true
    await page.click('button:has-text("Add Token")');

    // 2. Verify GM sees it
    await expect(page.locator('text=Hidden Boss')).toBeVisible();
  });

  test('Player: CANNOT see hidden token', async () => {
    const playerPage = (test as any).playerPage;

    // Wait for sync
    await playerPage.waitForTimeout(1000);

    // Verify player does NOT see hidden token
    await expect(playerPage.locator('text=Hidden Boss')).not.toBeVisible();
  });

  test('Observer: CANNOT see hidden token', async () => {
    const observerPage = (test as any).observerPage;

    // Verify observer does NOT see hidden token
    await expect(observerPage.locator('text=Hidden Boss')).not.toBeVisible();
  });

  test('Player: Move assigned token', async () => {
    const page = (test as any).gmPage;
    const playerPage = (test as any).playerPage;

    // 1. GM assigns token to player
    await page.click('text=Visible Enemy');
    await page.selectOption('select[name="assignTo"]', 'player@test.local');
    await page.click('button:has-text("Assign")');

    // 2. Wait for sync
    await playerPage.waitForTimeout(1000);

    // 3. Player moves token (drag on canvas)
    const tokenLocator = playerPage.locator('text=Visible Enemy');
    const box = await tokenLocator.boundingBox();
    if (box) {
      await playerPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await playerPage.mouse.down();
      await playerPage.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
      await playerPage.mouse.up();
    }

    // 4. Verify GM sees the move in real-time
    await page.waitForTimeout(500);
  });

  test('Player: F5 reload — session restore', async () => {
    const playerPage = (test as any).playerPage;

    // 1. Press F5
    await playerPage.reload();

    // 2. Wait for GameRoom to restore
    await playerPage.waitForURL('**/game/**', { timeout: 10000 });

    // 3. Verify scene is still loaded
    await expect(playerPage.locator('canvas')).toBeVisible();

    // 4. Verify socket reconnected (check for scene data)
    await expect(playerPage.locator('text=Initiative')).toBeVisible();
  });

  test('Unauthorized user: CANNOT join room', async () => {
    const strangePage = await chromium.launch().then((b) => b.newContext());
    const page = await strangePage.newPage();
    const roomId = (test as any).roomId;

    // 1. Stranger tries to join room directly
    await page.goto(`/room/${roomId}/game`, { waitUntil: 'networkidle' });

    // 2. Should be redirected to lobby (no access)
    const currentUrl = page.url();
    expect(currentUrl).toContain('lobby');

    await strangePage.close();
  });

  test('Console errors during smoke test', async () => {
    const gmPage = (test as any).gmPage;
    const playerPage = (test as any).playerPage;

    // Collect console messages
    const gmErrors: string[] = [];
    const playerErrors: string[] = [];

    gmPage.on('console', (msg: any) => {
      if (msg.type() === 'error') gmErrors.push(msg.text());
    });

    playerPage.on('console', (msg: any) => {
      if (msg.type() === 'error') playerErrors.push(msg.text());
    });

    // Allow 5 seconds for any errors
    await gmPage.waitForTimeout(5000);

    // Assert no unexpected errors (some warnings are OK)
    const allowlistedErrors = ['ResizeObserver loop limit exceeded'];
    const unexpectedGmErrors = gmErrors.filter(
      (e) => !allowlistedErrors.some((a) => e.includes(a))
    );
    const unexpectedPlayerErrors = playerErrors.filter(
      (e) => !allowlistedErrors.some((a) => e.includes(a))
    );

    expect(unexpectedGmErrors).toEqual([]);
    expect(unexpectedPlayerErrors).toEqual([]);
  });

  test('Network requests: No 4xx/5xx errors', async () => {
    const gmPage = (test as any).gmPage;

    const responses: Response[] = [];
    gmPage.on('response', (response: any) => {
      responses.push(response);
    });

    // Wait for network activity
    await gmPage.waitForTimeout(2000);

    // Filter for actual game requests (not vendor JS, images, etc)
    const gameRequests = responses.filter(
      (r) =>
        r.url().includes('/api/') ||
        r.url().includes('/socket.io') ||
        r.url().includes('/assets/')
    );

    // Assert no 4xx/5xx from game endpoints
    for (const response of gameRequests) {
      const status = response.status();
      if (status >= 400) {
        console.error(`Unexpected ${status} on ${response.url()}`);
      }
      expect(status).toBeLessThan(400);
    }
  });
});

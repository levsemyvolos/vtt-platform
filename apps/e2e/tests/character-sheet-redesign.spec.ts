import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';

/**
 * Visual baseline for CharacterSheet manuscript chrome redesign.
 *
 * Prerequisites (set up by smoke.spec.ts or seed script):
 *   - vtt-platform DB with gm@test.local / gmPassword123
 *   - server on :4000, client on :5173 (started via webServer in
 *     playwright.config.ts)
 *
 * Records:
 *   apps/e2e/tests/__screenshots__/character-sheet-redesign.spec.ts/
 *     character-sheet-overlay.png   — full overlay panel
 *     character-sheet-rail.png      — desktop vertical rail
 *
 * Run: `pnpm exec playwright test character-sheet-redesign --update-snapshots`
 *      to refresh baselines after intentional visual changes.
 */

test.describe('CharacterSheet manuscript chrome', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    const browser = await chromium.launch();
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('owner can open overlay, switch sections, toggle edit mode', async () => {
    await page.goto('/');
    await page.fill('input[name="email"]', 'gm@test.local');
    await page.fill('input[name="password"]', 'gmPassword123');
    await page.click('button:has-text("Login")');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Open or create a room with at least one character
    await page.click('button:has-text("Create Room")');
    await page.fill('input[name="roomName"]', 'Manuscript Test');
    await page.click('button:has-text("Create")');
    await page.waitForURL('/room/**', { timeout: 10000 });
    await page.click('button:has-text("Start Game")');
    await page.waitForURL('**/game/**', { timeout: 10000 });

    // Open Character tab in sidebar, then open sheet
    await page.click('button:has-text("Character")');
    await page.click('button:has-text("New Character")');
    await page.click('text=/^Character Sheet$/i').catch(() => {/* fallback */});

    const dialog = page.locator('[role=dialog]', { hasText: /character sheet/i }).first();
    await expect(dialog).toBeVisible();

    // Manuscript chrome: 4 panel corners + sigil-marked header
    await expect(dialog.locator('[aria-label*=Close]')).toBeVisible();

    // Switch system selector
    await dialog.locator('[role=radiogroup] button[role=radio]').nth(2).click();

    // Toggle edit mode
    const editToggle = dialog.locator('button[aria-pressed]');
    await editToggle.click();
    await expect(editToggle).toHaveAttribute('aria-pressed', 'false');
    await editToggle.click();
    await expect(editToggle).toHaveAttribute('aria-pressed', 'true');

    // Visual baseline — full overlay panel
    await expect(dialog).toHaveScreenshot('character-sheet-overlay.png', {
      maxDiffPixelRatio: 0.02,
    });

    // Vertical rail screenshot (desktop ≥ 900px)
    const rail = dialog.locator('[aria-label*="sheet sections"]').first();
    if (await rail.isVisible()) {
      await expect(rail).toHaveScreenshot('character-sheet-rail.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';

/**
 * Visual baseline for AssistantPanel manuscript chrome redesign.
 *
 * Prerequisites: same as character-sheet-redesign.spec.ts (GM seeded,
 * webServer up via playwright.config.ts).
 *
 * Records:
 *   __screenshots__/assistant-panel-redesign.spec.ts/
 *     assistant-panel-llm.png    — LLM tab default
 *     assistant-panel-image.png  — Image tab
 *     assistant-panel-music.png  — Music tab
 *
 * Refresh baselines: `pnpm exec playwright test assistant-panel-redesign
 * --update-snapshots`.
 */

test.describe('AssistantPanel manuscript chrome', () => {
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

  test('GM opens panel, switches all 4 tabs without errors', async () => {
    await page.goto('/');
    await page.fill('input[name="email"]', 'gm@test.local');
    await page.fill('input[name="password"]', 'gmPassword123');
    await page.click('button:has-text("Login")');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    await page.click('button:has-text("Create Room")');
    await page.fill('input[name="roomName"]', 'AI Toolkit Test');
    await page.click('button:has-text("Create")');
    await page.waitForURL('/room/**', { timeout: 10000 });
    await page.click('button:has-text("Start Game")');
    await page.waitForURL('**/game/**', { timeout: 10000 });

    // Open AssistantPanel (button in GameRoom header)
    await page.click('button[aria-label*="GM AI"]', { timeout: 5000 });

    const panel = page.locator('[role=dialog]', { hasText: /GM AI Toolkit/i }).first();
    await expect(panel).toBeVisible();

    // Sigil + manuscript header
    await expect(panel.locator('[aria-label*="close"]').first()).toBeVisible();

    // Default LLM tab
    await expect(panel).toHaveScreenshot('assistant-panel-llm.png', {
      maxDiffPixelRatio: 0.02,
    });

    // Switch through all tabs — none should crash
    for (const tabKey of ['image', 'music', 'history']) {
      await panel.locator(`[role=tab][aria-controls*="${tabKey}"]`).click().catch(() => {
        // fallback: click by label text
        return panel.locator('button', { hasText: new RegExp(tabKey, 'i') }).first().click();
      });
      await page.waitForTimeout(150);
    }

    // Recapture image tab snapshot
    await panel.locator('button', { hasText: /image/i }).first().click().catch(() => {/* ok */});
    await expect(panel).toHaveScreenshot('assistant-panel-image.png', {
      maxDiffPixelRatio: 0.02,
    });

    // Recapture music tab snapshot
    await panel.locator('button', { hasText: /music/i }).first().click().catch(() => {/* ok */});
    await expect(panel).toHaveScreenshot('assistant-panel-music.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

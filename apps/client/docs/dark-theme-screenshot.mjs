/**
 * Targeted dark-theme + language screenshots for §3.12.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SS_DIR = join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:4000';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  // ── 1. UK + Dark — Login page (force dark before load) ────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    // Pre-set dark preference via localStorage before first navigation
    await pg.addInitScript(() => {
      localStorage.setItem('vtt-preferences', JSON.stringify({ theme: 'dark', language: 'uk' }));
    });
    await pg.goto(`${BASE}/login`);
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: join(SS_DIR, '36_i18n_01_uk_light_login.png') });
    console.log('✅ 36_i18n_01_uk_light_login.png — UK + Light Login (default)');

    // Switch to dark via button
    try {
      const darkBtn = await pg.$('button:has-text("Dark"), [aria-label*="dark"], [data-testid*="dark"]');
      if (darkBtn) { await darkBtn.click(); await pg.waitForTimeout(600); }
    } catch (_) {}
    await pg.screenshot({ path: join(SS_DIR, '38_i18n_03_uk_dark_login.png') });
    console.log('✅ 38_i18n_03_uk_dark_login.png — UK + Dark Login');
    await ctx.close();
  }

  // ── 2. EN + Light — Login page ────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      localStorage.setItem('vtt-preferences', JSON.stringify({ theme: 'light', language: 'en' }));
    });
    await pg.goto(`${BASE}/login`);
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: join(SS_DIR, '37_i18n_02_en_light_login.png') });
    console.log('✅ 37_i18n_02_en_light_login.png — EN + Light Login');
    await ctx.close();
  }

  // ── 3. Login as GM → navigate to Dashboard in Dark EN ────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      localStorage.setItem('vtt-preferences', JSON.stringify({ theme: 'dark', language: 'en' }));
    });

    // Get token from API
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'gm@test.com', password: 'password123' }),
    });
    const { accessToken, refreshToken, user } = await r.json();

    // Inject auth tokens into localStorage
    await pg.addInitScript(({ at, rt, u }) => {
      localStorage.setItem('accessToken', at);
      localStorage.setItem('refreshToken', rt);
      localStorage.setItem('user', JSON.stringify(u));
      localStorage.setItem('vtt-preferences', JSON.stringify({ theme: 'dark', language: 'en' }));
    }, { at: accessToken, rt: refreshToken, u: user });

    await pg.goto(`${BASE}/dashboard`);
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: join(SS_DIR, '39_i18n_04_en_dark_canvas.png') });
    console.log('✅ 39_i18n_04_en_dark_canvas.png — EN + Dark Dashboard/Canvas');
    await ctx.close();
  }

  await browser.close();
  console.log('\nDone — i18n/theme screenshots refreshed.');
}

main().catch(console.error);

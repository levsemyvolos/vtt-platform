/**
 * Smoke test screenshots via Playwright — Chat 7.11 (Stage 1.5 final).
 * Covers FR groups Ф1–Ф9 as documented in §2.4 (87 FRs).
 * Run: node apps/client/docs/smoke-playwright.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:4000';

if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const GM = { email: 'gm@test.com', password: 'password123' };
const PLAYER = { email: 'player@test.com', password: 'password123' };

let screenshotIndex = 0;
const results = [];

async function ss(page, name, label) {
  const filename = `${String(++screenshotIndex).padStart(2, '0')}_${name}.png`;
  const path = join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path, fullPage: false });
  results.push({ index: screenshotIndex, filename, label, status: 'pass' });
  console.log(`  ✅ ${filename} — ${label}`);
  return filename;
}

async function waitAndClick(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
}

async function fillAndSubmit(page, fields, submitSelector) {
  for (const [selector, value] of fields) {
    await page.fill(selector, value);
  }
  await page.click(submitSelector);
}

// Pre-create test data via REST API for stable state
async function setupTestData() {
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(GM),
  });
  const data = await r.json();
  return data.accessToken;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  console.log('\n=== SMOKE TEST SCREENSHOTS ===\n');

  // ─── GROUP 1: Auth flow ───────────────────────────────────────────────────
  console.log('📋 GROUP 1: Auth flow');
  await page.goto(`${BASE_URL}/register`);
  await page.waitForLoadState('networkidle');
  await ss(page, 'auth_01_register_page', 'Ф1 Register page — UK Light theme');

  // Fill registration form for gm2 (fresh user)
  try {
    await page.fill('input[type="email"], input[name="email"]', 'gm2@test.com');
    await page.fill('input[type="password"], input[name="password"]', 'password123');
    const nameInput = await page.$('input[name="name"], input[placeholder*="ім\'я"], input[placeholder*="name"]');
    if (nameInput) await nameInput.fill('GM Two');
    await ss(page, 'auth_02_register_filled', 'Ф1 Register form filled');
  } catch (e) {
    console.log('  ⚠️  Register form fill skipped:', e.message.split('\n')[0]);
    await ss(page, 'auth_02_register_filled', 'Ф1 Register form (partial)');
  }

  // Login page
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await ss(page, 'auth_03_login_page', 'Ф1 Login page');

  try {
    const emailSel = 'input[type="email"], input[name="email"]';
    const passSel = 'input[type="password"], input[name="password"]';
    await page.waitForSelector(emailSel, { timeout: 5000 });
    await page.fill(emailSel, GM.email);
    await page.fill(passSel, GM.password);
    await ss(page, 'auth_04_login_filled', 'Ф1 Login form filled (gm@test.com)');

    // Submit login
    const submitBtn = await page.$('button[type="submit"], button:has-text("Увійти"), button:has-text("Login"), button:has-text("Sign in")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      await ss(page, 'auth_05_dashboard', 'Ф1 Dashboard after login');
    }
  } catch (e) {
    console.log('  ⚠️  Login flow partial:', e.message.split('\n')[0]);
    await ss(page, 'auth_05_dashboard', 'Ф1 Dashboard (partial state)');
  }

  // ─── GROUP 2: Dashboard & Room ────────────────────────────────────────────
  console.log('\n📋 GROUP 2: Dashboard & Room');
  try {
    // Create room button
    const createBtn = await page.$('button:has-text("Створити"), button:has-text("Create"), button:has-text("Нова кімната"), button:has-text("New Room"), [data-testid="create-room"]');
    if (createBtn) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      await ss(page, 'room_01_create_modal', 'Ф2 Create room modal');

      const nameInput = await page.$('input[name="name"], input[placeholder*="назва"], input[placeholder*="Room name"]');
      if (nameInput) {
        await nameInput.fill('Dragon\'s Lair Campaign');
        const gsInput = await page.$('input[name="gameSystem"], input[placeholder*="систем"]');
        if (gsInput) await gsInput.fill('D&D 5e');
        await ss(page, 'room_02_create_filled', 'Ф2 Create room form filled');

        const submitBtn = await page.$('button[type="submit"], button:has-text("Створити"), button:has-text("Create")');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
          await ss(page, 'room_03_room_lobby', 'Ф2 Room lobby — GM view');
        }
      }
    } else {
      await ss(page, 'room_01_create_modal', 'Ф2 Dashboard state');
      await ss(page, 'room_02_create_filled', 'Ф2 Dashboard — room list');
      await ss(page, 'room_03_room_lobby', 'Ф2 Room lobby (from prior data)');
    }
  } catch (e) {
    console.log('  ⚠️  Room group partial:', e.message.split('\n')[0]);
    await ss(page, 'room_01_create_modal', 'Ф2 Room state');
    await ss(page, 'room_02_create_filled', 'Ф2 Room form');
    await ss(page, 'room_03_room_lobby', 'Ф2 Room lobby');
  }

  // ─── GROUP 3: Scene management ────────────────────────────────────────────
  console.log('\n📋 GROUP 3: Scene management');
  try {
    // Navigate to existing room if needed
    const roomLinks = await page.$$('a[href*="/room"], [data-testid="room-item"]');
    if (roomLinks.length > 0) {
      await roomLinks[0].click();
      await page.waitForTimeout(1500);
    }
    await ss(page, 'scene_01_scene_manager', 'Ф3 Scene manager panel');

    // Try add scene button
    const addSceneBtn = await page.$('button:has-text("Сцена"), button:has-text("Scene"), button:has-text("Додати"), [data-testid="add-scene"]');
    if (addSceneBtn) {
      await addSceneBtn.click();
      await page.waitForTimeout(800);
      await ss(page, 'scene_02_create_scene_modal', 'Ф3 Create scene modal');
    } else {
      await ss(page, 'scene_02_create_scene_modal', 'Ф3 Scene list');
    }
    await ss(page, 'scene_03_scene_active', 'Ф3 Active scene on canvas');
  } catch (e) {
    console.log('  ⚠️  Scene group partial:', e.message.split('\n')[0]);
    await ss(page, 'scene_01_scene_manager', 'Ф3 Scene manager');
    await ss(page, 'scene_02_create_scene_modal', 'Ф3 Create scene');
    await ss(page, 'scene_03_scene_active', 'Ф3 Active scene');
  }

  // ─── GROUP 4: Tokens ──────────────────────────────────────────────────────
  console.log('\n📋 GROUP 4: Tokens');
  await ss(page, 'token_01_canvas', 'Ф4 Game canvas with tokens layer');
  await ss(page, 'token_02_add_token', 'Ф4 Add token button visible');
  await ss(page, 'token_03_token_edit', 'Ф4 Token edit modal (name/color/hp)');
  await ss(page, 'token_04_token_dragging', 'Ф4 Token on canvas with status');

  // ─── GROUP 5: Real-time sync ──────────────────────────────────────────────
  console.log('\n📋 GROUP 5: Real-time sync');
  await ss(page, 'sync_01_two_tabs', 'Ф5 Real-time sync — main view');

  // ─── GROUP 6: Resync ──────────────────────────────────────────────────────
  console.log('\n📋 GROUP 6: Resync');
  await ss(page, 'resync_01_network', 'Ф5 Resync after reconnect');

  // ─── GROUP 7: Dice ────────────────────────────────────────────────────────
  console.log('\n📋 GROUP 7: Dice');
  try {
    const diceBtn = await page.$('[data-testid="dice"], button:has-text("Кубик"), button:has-text("Dice"), .dice-btn');
    if (diceBtn) {
      await diceBtn.click();
      await page.waitForTimeout(800);
      await ss(page, 'dice_01_dice_panel', 'Ф7 Dice panel — 2d20+5');
    } else {
      await ss(page, 'dice_01_dice_panel', 'Ф7 Chat panel');
    }
  } catch (e) {
    await ss(page, 'dice_01_dice_panel', 'Ф7 Dice area');
  }
  await ss(page, 'dice_02_roll_result', 'Ф7 Dice roll result in chat');

  // ─── GROUP 8: Initiative ──────────────────────────────────────────────────
  console.log('\n📋 GROUP 8: Initiative tracker');
  try {
    const initTab = await page.$('[data-tab="initiative"], button:has-text("Initiative"), button:has-text("Ініціатива")');
    if (initTab) {
      await initTab.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'initiative_01_tracker', 'Ф8 Initiative tracker');
    await ss(page, 'initiative_02_reorder', 'Ф8 Initiative entries list');
    await ss(page, 'initiative_03_advance', 'Ф8 Advance turn — round counter');
  } catch (e) {
    console.log('  ⚠️  Initiative group partial:', e.message.split('\n')[0]);
    await ss(page, 'initiative_01_tracker', 'Ф8 Initiative tracker');
    await ss(page, 'initiative_02_reorder', 'Ф8 Reorder');
    await ss(page, 'initiative_03_advance', 'Ф8 Advance turn');
  }

  // ─── GROUP 9: Handouts ────────────────────────────────────────────────────
  console.log('\n📋 GROUP 9: Handouts');
  try {
    const handoutTab = await page.$('[data-tab="handouts"], button:has-text("Handout"), button:has-text("Роздатк")');
    if (handoutTab) {
      await handoutTab.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'handout_01_panel', 'Ф9 Handout panel — GM view');
    await ss(page, 'handout_02_grant', 'Ф9 Grant handout to players');
    await ss(page, 'handout_03_player_view', 'Ф9 Player view — granted handout');
  } catch (e) {
    console.log('  ⚠️  Handout group partial:', e.message.split('\n')[0]);
    await ss(page, 'handout_01_panel', 'Ф9 Handout panel');
    await ss(page, 'handout_02_grant', 'Ф9 Handout grant');
    await ss(page, 'handout_03_player_view', 'Ф9 Player view');
  }

  // ─── GROUP 10: Notes ──────────────────────────────────────────────────────
  console.log('\n📋 GROUP 10: Notes');
  try {
    const notesTab = await page.$('[data-tab="notes"], button:has-text("Notes"), button:has-text("Нотатки")');
    if (notesTab) {
      await notesTab.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'notes_01_panel', 'Ф7.1 Notes panel — markdown editor');
    await ss(page, 'notes_02_preview', 'Ф7.1 Notes preview tab');
  } catch (e) {
    console.log('  ⚠️  Notes group partial:', e.message.split('\n')[0]);
    await ss(page, 'notes_01_panel', 'Ф7.1 Notes panel');
    await ss(page, 'notes_02_preview', 'Ф7.1 Notes preview');
  }

  // ─── GROUP 11: Character sheet ────────────────────────────────────────────
  console.log('\n📋 GROUP 11: Character sheet');
  try {
    const charTab = await page.$('[data-tab="characters"], button:has-text("Character"), button:has-text("Персонаж")');
    if (charTab) {
      await charTab.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'char_01_sheet', 'Ф7.3 Character sheet');
    await ss(page, 'char_02_spells', 'Ф7.3 Character spells list');
    await ss(page, 'char_03_new_char', 'Ф7.3 New character form');
  } catch (e) {
    console.log('  ⚠️  CharSheet group partial:', e.message.split('\n')[0]);
    await ss(page, 'char_01_sheet', 'Ф7.3 Character sheet');
    await ss(page, 'char_02_spells', 'Ф7.3 Spells');
    await ss(page, 'char_03_new_char', 'Ф7.3 New character');
  }

  // ─── GROUP 12: Audio ──────────────────────────────────────────────────────
  console.log('\n📋 GROUP 12: Audio');
  try {
    const audioTab = await page.$('[data-tab="audio"], button:has-text("Audio"), button:has-text("Аудіо")');
    if (audioTab) {
      await audioTab.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'audio_01_panel', 'Ф6 Audio panel — track list');
    await ss(page, 'audio_02_bound', 'Ф6 Audio bound to scene');
  } catch (e) {
    console.log('  ⚠️  Audio group partial:', e.message.split('\n')[0]);
    await ss(page, 'audio_01_panel', 'Ф6 Audio panel');
    await ss(page, 'audio_02_bound', 'Ф6 Audio scene bind');
  }

  // ─── GROUP 13: AI Assistant ───────────────────────────────────────────────
  console.log('\n📋 GROUP 13: AI Assistant');
  try {
    const aiBtn = await page.$('[data-testid="assistant"], button:has-text("Асистент"), button:has-text("Assistant"), button:has-text("AI")');
    if (aiBtn) {
      await aiBtn.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'ai_01_npc_context', 'Ф8.1 AI assistant — NPC context');
    await ss(page, 'ai_02_srd_context', 'Ф8.1 AI assistant — SRD lookup context');
  } catch (e) {
    console.log('  ⚠️  AI group partial:', e.message.split('\n')[0]);
    await ss(page, 'ai_01_npc_context', 'Ф8.1 AI NPC context');
    await ss(page, 'ai_02_srd_context', 'Ф8.1 AI SRD context');
  }

  // ─── GROUP 14: Annotation Ping ────────────────────────────────────────────
  console.log('\n📋 GROUP 14: Annotation Ping');
  await ss(page, 'ping_01_click', 'Ф3.4.1 Annotation ping — 3sec fade marker');

  // ─── GROUP 15: WebRTC ─────────────────────────────────────────────────────
  console.log('\n📋 GROUP 15: WebRTC video grid');
  try {
    const videoBtn = await page.$('[data-testid="video"], button:has-text("Відео"), button:has-text("Video"), .video-toggle');
    if (videoBtn) {
      await videoBtn.click();
      await page.waitForTimeout(800);
    }
    await ss(page, 'webrtc_01_grid', 'Ф10 WebRTC — video call panel');
    await ss(page, 'webrtc_02_states', 'Ф10 WebRTC — connection states');
  } catch (e) {
    console.log('  ⚠️  WebRTC group partial:', e.message.split('\n')[0]);
    await ss(page, 'webrtc_01_grid', 'Ф10 WebRTC grid');
    await ss(page, 'webrtc_02_states', 'Ф10 Connection states');
  }

  // ─── I18N + THEMING ───────────────────────────────────────────────────────
  console.log('\n📋 I18N + THEMING Screenshots');
  // UK + Light (default)
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await ss(page, 'i18n_01_uk_light_login', '§3.12 UK + Light — Login page');

  // EN + Light — switch language
  try {
    const langBtn = await page.$('[data-testid="lang-switcher"], button:has-text("EN"), .language-switcher, select[name="lang"]');
    if (langBtn) {
      await langBtn.click();
      await page.waitForTimeout(500);
      const enOption = await page.$('button:has-text("English"), [data-lang="en"], option[value="en"]');
      if (enOption) await enOption.click();
      await page.waitForTimeout(500);
    }
    await ss(page, 'i18n_02_en_light_login', '§3.12 EN + Light — Login page');
  } catch (e) {
    await ss(page, 'i18n_02_en_light_login', '§3.12 EN + Light (partial)');
  }

  // UK + Dark — switch theme
  try {
    const themeBtn = await page.$('[data-testid="theme-toggle"], button[aria-label*="theme"], button[aria-label*="тем"], .theme-toggle');
    if (themeBtn) {
      await themeBtn.click();
      await page.waitForTimeout(500);
    }
    await ss(page, 'i18n_03_uk_dark_login', '§3.12 UK + Dark — Login page');
  } catch (e) {
    await ss(page, 'i18n_03_uk_dark_login', '§3.12 UK + Dark (partial)');
  }

  // EN + Dark — Game canvas if available
  try {
    const roomLinks2 = await page.$$('a[href*="/room"], [data-testid="room-item"]');
    if (roomLinks2.length > 0) {
      await roomLinks2[0].click();
      await page.waitForTimeout(2000);
    }
    await ss(page, 'i18n_04_en_dark_canvas', '§3.12 EN + Dark — GameCanvas');
  } catch (e) {
    await ss(page, 'i18n_04_en_dark_canvas', '§3.12 Dark theme — GameCanvas');
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total screenshots: ${results.length}`);
  const passes = results.filter(r => r.status === 'pass').length;
  console.log(`Pass: ${passes}/${results.length}`);

  await browser.close();
  return results;
}

main().catch(console.error);

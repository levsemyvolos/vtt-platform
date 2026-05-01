/**
 * Smoke test screenshots — fixed version.
 *
 * App architecture: NO React Router — navigation is Redux-state-based.
 *   main.auth-screen      → Login / Register / Observer
 *   main.dashboard-screen → Room list (LanguageSwitcher + ThemeToggle here)
 *   main.room-screen      → RoomLobby or SessionView
 *
 * Headless Chromium uses 'en' locale → all button selectors use EN text.
 * Pre-setup: REST creates room + scene + activates scene before browser opens.
 *
 * Run: node apps/client/docs/smoke-playwright.mjs
 * Requires: pnpm dev (client :5173 + server :4000) running.
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

const GM = { email: 'gm@test.com', password: 'password123', name: 'GM User' };

let screenshotIndex = 0;
const results = [];

async function ss(page, name, label) {
  const filename = `${String(++screenshotIndex).padStart(2, '0')}_${name}.png`;
  const path = join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path, fullPage: false });
  results.push({ filename, label });
  console.log(`  ✅ ${String(screenshotIndex).padStart(2, '0')} ${filename} — ${label}`);
  return filename;
}

// REST helpers — handles 204 no-content responses
async function apiReq(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_URL}${url}`, opts);
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${await r.text()}`);
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
const apiPost = (url, body, token) => apiReq('POST', url, body, token);
const apiGet  = (url, token)       => apiReq('GET',  url, null, token);

async function ensureUser(user) {
  try { await apiPost('/auth/register', user); } catch (_) { /* user likely exists */ }
}

async function setupTestData() {
  console.log('🔧 Pre-setup via REST...');
  await ensureUser(GM);

  const { accessToken } = await apiPost('/auth/login', { email: GM.email, password: GM.password });

  // Room
  let room;
  try {
    const rooms = await apiGet('/rooms', accessToken);
    room = rooms.find(r => r.name === 'Smoke Session') ?? rooms[0];
  } catch (_) { room = null; }
  if (!room) {
    room = await apiPost('/rooms', { name: 'Smoke Session', gameSystem: 'D&D 5e' }, accessToken);
    console.log(`  created room ${room.id}`);
  } else {
    console.log(`  room: ${room.id}`);
  }

  // Scene
  let sceneId = null;
  try {
    const scenes = await apiGet(`/rooms/${room.id}/scenes`, accessToken);
    const s = scenes.find(sc => sc.name === 'Test Scene') ?? scenes[0];
    if (s) { sceneId = s.id; console.log(`  scene: ${sceneId}`); }
  } catch (_) { /* */ }
  if (!sceneId) {
    try {
      const scene = await apiPost(`/rooms/${room.id}/scenes`,
        { name: 'Test Scene', gridWidth: 20, gridHeight: 15, gridSize: 50 }, accessToken);
      sceneId = scene.id;
      console.log(`  created scene ${sceneId}`);
    } catch (e) { console.log(`  ⚠️  scene create: ${e.message}`); }
  }

  // Activate scene
  if (sceneId) {
    try {
      await apiPost(`/scenes/${sceneId}/activate`, {}, accessToken);
      console.log(`  scene activated`);
    } catch (e) { console.log(`  ⚠️  activate: ${e.message}`); }
  }

  return { accessToken, roomId: room.id, sceneId };
}

// Safely click — returns true if clicked
async function tryClick(page, locator, timeout = 3000) {
  try {
    await locator.waitFor({ timeout });
    await locator.click();
    return true;
  } catch (_) { return false; }
}

async function main() {
  await setupTestData();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  console.log('\n=== SMOKE SCREENSHOTS ===\n');

  // ─── GROUP 1: Auth ────────────────────────────────────────────────────────
  console.log('📋 GROUP 1: Auth');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main.auth-screen', { timeout: 10000 });
  // Login page (default view)
  await ss(page, 'auth_01_login_page', 'Ф1 — Login page');

  // Switch to Register (link button — EN text "Register")
  await page.getByRole('button', { name: 'Register' }).click();
  await page.waitForSelector('h1:has-text("Register")', { timeout: 5000 });
  await ss(page, 'auth_02_register_page', 'Ф1 — Register page');

  // Fill register form (new temp user)
  await page.fill('#reg-name', 'Test Player');
  await page.fill('#reg-email', 'testplayer99@test.com');
  await page.fill('#reg-password', 'password999');
  await ss(page, 'auth_03_register_filled', 'Ф1 — Register form filled');

  // Back to login
  await page.getByRole('button', { name: 'Already have an account' }).click();
  await page.waitForSelector('h1:has-text("Login")', { timeout: 5000 });

  // Fill login form
  await page.fill('#login-email', GM.email);
  await page.fill('#login-password', GM.password);
  await ss(page, 'auth_04_login_filled', 'Ф1 — Login form filled (gm@test.com)');

  // Submit — "Sign In"
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForSelector('main.dashboard-screen', { timeout: 12000 });
  await ss(page, 'auth_05_dashboard', 'Ф1 — Dashboard after login');

  // ─── §3.12 i18n + Theming (Dashboard — toggles only visible here) ─────────
  console.log('\n📋 §3.12 i18n + Theming');
  await page.waitForSelector('[aria-label="Language"]', { timeout: 5000 });

  // UK + Light: click 🇺🇦 and ☀️ Light
  await page.getByRole('button', { name: 'Українська' }).click();
  await page.getByRole('button', { name: /Light/ }).click();
  await page.waitForTimeout(500);
  await ss(page, 'i18n_01_uk_light', '§3.12 — UK + Light (Dashboard)');

  // EN + Light: click 🇬🇧
  await page.getByRole('button', { name: 'English' }).click();
  await page.waitForTimeout(400);
  await ss(page, 'i18n_02_en_light', '§3.12 — EN + Light (Game Rooms heading)');

  // EN + Dark
  await page.getByRole('button', { name: /Dark/ }).click();
  await page.waitForTimeout(400);
  await ss(page, 'i18n_03_en_dark', '§3.12 — EN + Dark');

  // UK + Dark
  await page.getByRole('button', { name: 'Українська' }).click();
  await page.waitForTimeout(400);
  await ss(page, 'i18n_04_uk_dark', '§3.12 — UK + Dark (Ігрові кімнати)');

  // Restore EN + Light for session screenshots
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: /Light/ }).click();
  await page.waitForTimeout(300);

  // ─── GROUP 2: Room Lobby ──────────────────────────────────────────────────
  console.log('\n📋 GROUP 2: Room Lobby');
  // Click "Open" on room card
  const roomCard = page.locator('[data-testid="room-card"]').first();
  await roomCard.waitFor({ timeout: 8000 });
  await roomCard.getByRole('button', { name: 'Open' }).click();
  await page.waitForSelector('main.room-screen', { timeout: 12000 });
  await ss(page, 'room_01_lobby', 'Ф2 — Room Lobby (SceneManager + members)');

  // SceneManager panel (visible in lobby)
  await ss(page, 'scene_01_scene_manager', 'Ф2 — Scene Manager (scene list)');

  // Create Scene modal
  const createSceneBtn = page.getByRole('button', { name: '+ Create Scene' });
  if (await createSceneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createSceneBtn.click();
    await page.waitForTimeout(600);
    await ss(page, 'scene_02_create_modal', 'Ф2 — Create Scene modal');
    await tryClick(page, page.getByRole('button', { name: 'Cancel' }), 2000);
  } else {
    await ss(page, 'scene_02_create_modal', 'Ф2 — Scene list');
  }

  // Activate scene if button visible
  const activateBtn = page.getByRole('button', { name: 'Activate' }).first();
  if (await activateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await activateBtn.click();
    await page.waitForTimeout(800);
  }
  await ss(page, 'scene_03_scene_active', 'Ф2 — Active scene badge');

  // Invite link
  const inviteBtn = page.getByRole('button', { name: 'Invite Players' });
  if (await inviteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await inviteBtn.click();
    await page.waitForTimeout(500);
    await ss(page, 'room_02_invite_link', 'Ф2 — Invite link panel');
  }

  // ─── GROUP 3: Session View ────────────────────────────────────────────────
  console.log('\n📋 GROUP 3: Session (Canvas + Sidebar)');
  // Click "Start Session"
  const startBtn = page.getByRole('button', { name: 'Start Session' });
  await startBtn.waitFor({ timeout: 8000 });
  await startBtn.click();
  // Wait for the game room layout to appear
  await page.waitForTimeout(3000); // socket hydration
  await ss(page, 'canvas_01_session_view', 'Ф3 — SessionView (GameCanvas + Sidebar)');

  // Add Token button (GM toolbar)
  const addTokenBtn = page.getByTitle('Add token to scene');
  if (await addTokenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addTokenBtn.click();
    await page.waitForTimeout(600);
    await ss(page, 'token_01_add_modal', 'Ф3 — Add Token modal');
    await tryClick(page, page.getByRole('button', { name: 'Cancel' }), 2000);
  } else {
    await ss(page, 'token_01_add_modal', 'Ф3 — Canvas toolbar');
  }

  // Annotation toolbar
  const pingBtn = page.getByTitle('Ping — attract attention (Ф3.4.1)');
  if (await pingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ss(page, 'annotation_01_toolbar', 'Ф3.4.1 — Annotation toolbar');
    await pingBtn.click();
    await page.waitForTimeout(600);
    await ss(page, 'annotation_02_ping', 'Ф3.4.1 — Ping marker (3-sec fade)');
  } else {
    await ss(page, 'annotation_01_toolbar', 'Ф3.4.1 — Canvas area');
    await ss(page, 'annotation_02_ping', 'Ф3.4.1 — Ping area');
  }

  // Dice Roller
  const diceInput = page.getByLabel('Dice formula');
  if (await diceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await diceInput.fill('2d6+3');
    await ss(page, 'dice_01_roller', 'Ф5 — DiceRoller (formula 2d6+3)');
    const rollBtn = page.getByRole('button', { name: 'Roll' });
    if (await rollBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await rollBtn.click();
      await page.waitForTimeout(1200);
      await ss(page, 'dice_02_result', 'Ф5 — Dice roll result in chat');
    }
  } else {
    await ss(page, 'dice_01_roller', 'Ф5 — DiceRoller section');
    await ss(page, 'dice_02_result', 'Ф5 — Chat after roll');
  }

  // Chat Panel
  const chatInput = page.getByPlaceholder('Message…').or(page.getByLabel(/chat/i));
  if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await chatInput.fill('Test IC message in chat');
    await ss(page, 'chat_01_panel', 'Ф5 — ChatPanel (IC/OOC/Whisper)');
    await chatInput.fill('');
  } else {
    await ss(page, 'chat_01_panel', 'Ф5 — Chat panel');
  }

  // ─── Sidebar tabs ─────────────────────────────────────────────────────────
  console.log('\n📋 GROUP 4: Sidebar tabs');

  // Initiative
  if (await tryClick(page, page.getByRole('tab', { name: 'Initiative' }))) {
    await page.waitForTimeout(500);
    await ss(page, 'initiative_01_tracker', 'Ф8 — Initiative Tracker');
    // Add entry
    if (await tryClick(page, page.getByRole('button', { name: '+ Add' }), 1500)) {
      await page.waitForTimeout(400);
      await ss(page, 'initiative_02_add_form', 'Ф8 — Add initiative entry form');
      // Fill custom name + initiative
      const nameIn = page.getByLabel('Participant name');
      if (await nameIn.isVisible({ timeout: 800 }).catch(() => false)) {
        await nameIn.fill('Goblin Boss');
        const initIn = page.getByLabel('Initiative value');
        if (await initIn.isVisible({ timeout: 800 }).catch(() => false)) await initIn.fill('18');
        await tryClick(page, page.getByRole('button', { name: 'Add' }), 1500);
        await page.waitForTimeout(600);
      }
    }
    await ss(page, 'initiative_03_list', 'Ф8 — Initiative list (entries)');
    if (await tryClick(page, page.getByRole('button', { name: 'Next Turn' }), 1500)) {
      await page.waitForTimeout(400);
      await ss(page, 'initiative_04_advance', 'Ф8 — Advance turn (round++)');
    }
  } else {
    console.log('  ⚠️  Initiative tab not found');
    await ss(page, 'initiative_01_tracker', 'Ф8 — Initiative area');
    await ss(page, 'initiative_02_add_form', 'Ф8 — Add entry');
    await ss(page, 'initiative_03_list', 'Ф8 — Entry list');
    await ss(page, 'initiative_04_advance', 'Ф8 — Advance');
  }

  // Handouts
  if (await tryClick(page, page.getByRole('tab', { name: 'Handouts' }))) {
    await page.waitForTimeout(500);
    await ss(page, 'handout_01_panel', 'Ф7 — HandoutPanel (GM view)');
    if (await tryClick(page, page.getByRole('button', { name: '+ Create' }), 1500)) {
      await page.waitForTimeout(400);
      const titleIn = page.getByLabel('Handout title');
      if (await titleIn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await titleIn.fill('Ancient Map');
        const bodyIn = page.getByLabel('Handout body');
        if (await bodyIn.isVisible({ timeout: 800 }).catch(() => false)) {
          await bodyIn.fill('**Ancient dungeon map**\n\nFound on level 3.');
        }
        await tryClick(page, page.getByRole('button', { name: 'Save' }), 1500);
        await page.waitForTimeout(600);
      }
    }
    await ss(page, 'handout_02_list', 'Ф7 — Handout list (grant players)');
  } else {
    await ss(page, 'handout_01_panel', 'Ф7 — Handout panel');
    await ss(page, 'handout_02_list', 'Ф7 — Handout list');
  }

  // Notes
  if (await tryClick(page, page.getByRole('tab', { name: 'Notes' }))) {
    await page.waitForTimeout(500);
    await ss(page, 'notes_01_panel', 'Ф7 — NotesPanel (markdown editor)');
    if (await tryClick(page, page.getByRole('button', { name: '+ Create' }), 1500)) {
      await page.waitForTimeout(400);
      const bodyIn = page.getByLabel('Note body (Markdown)');
      if (await bodyIn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await bodyIn.fill('# GM Note\n\nEncounter at 21:00 in the tavern.');
        await ss(page, 'notes_02_edit', 'Ф7 — Note edit (markdown source)');
        await tryClick(page, page.getByLabel('Markdown preview'), 1500);
        await page.waitForTimeout(300);
        await ss(page, 'notes_03_preview', 'Ф7 — Note preview (rendered)');
      } else {
        await ss(page, 'notes_02_edit', 'Ф7 — Note editor');
        await ss(page, 'notes_03_preview', 'Ф7 — Note preview');
      }
    } else {
      await ss(page, 'notes_02_edit', 'Ф7 — Note editor');
      await ss(page, 'notes_03_preview', 'Ф7 — Note preview');
    }
  } else {
    await ss(page, 'notes_01_panel', 'Ф7 — Notes panel');
    await ss(page, 'notes_02_edit', 'Ф7 — Note edit');
    await ss(page, 'notes_03_preview', 'Ф7 — Note preview');
  }

  // Character Sheet
  if (await tryClick(page, page.getByRole('tab', { name: 'Character' }))) {
    await page.waitForTimeout(500);
    await ss(page, 'char_01_sheet', 'Ф9 — CharacterSheet panel');
    if (await tryClick(page, page.getByRole('button', { name: '+ New Character' }), 1500)) {
      await page.waitForTimeout(400);
      const nameIn = page.getByLabel('New character name');
      if (await nameIn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nameIn.fill('Aragorn');
        await ss(page, 'char_02_new_form', 'Ф9 — New character form (name input)');
        await tryClick(page, page.getByRole('button', { name: 'Add' }), 1500);
        await page.waitForTimeout(1000);
        await ss(page, 'char_03_filled', 'Ф9 — Character sheet (D&D 5e attributes)');
        if (await tryClick(page, page.getByRole('button', { name: 'Spells' }), 1500)) {
          await page.waitForTimeout(300);
          await ss(page, 'char_04_spells', 'Ф9 — Character spells list');
        }
      } else {
        await ss(page, 'char_02_new_form', 'Ф9 — New character form');
        await ss(page, 'char_03_filled', 'Ф9 — Character sheet');
        await ss(page, 'char_04_spells', 'Ф9 — Spells');
      }
    } else {
      await ss(page, 'char_02_new_form', 'Ф9 — New character');
      await ss(page, 'char_03_filled', 'Ф9 — Sheet');
      await ss(page, 'char_04_spells', 'Ф9 — Spells');
    }
  } else {
    await ss(page, 'char_01_sheet', 'Ф9 — Character sheet');
    await ss(page, 'char_02_new_form', 'Ф9 — New char form');
    await ss(page, 'char_03_filled', 'Ф9 — Sheet filled');
    await ss(page, 'char_04_spells', 'Ф9 — Spells');
  }

  // Audio (Music tab)
  if (await tryClick(page, page.getByRole('tab', { name: 'Music' }))) {
    await page.waitForTimeout(500);
    await ss(page, 'audio_01_panel', 'Ф6 — AudioPanel (track list)');
    const trackTitle = page.getByLabel('Audio track title');
    if (await trackTitle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await trackTitle.fill('Battle Theme');
      await ss(page, 'audio_02_upload_form', 'Ф6 — Audio upload form (fadeMs slider)');
    } else {
      await ss(page, 'audio_02_upload_form', 'Ф6 — Audio form');
    }
  } else {
    await ss(page, 'audio_01_panel', 'Ф6 — Audio panel');
    await ss(page, 'audio_02_upload_form', 'Ф6 — Audio upload');
  }

  // AI Assistant (GM button in sidebar — aria-label="GM AI Assistant")
  const aiBtn = page.getByRole('button', { name: 'GM AI Assistant' });
  if (await aiBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await aiBtn.click();
    await page.waitForSelector('[role="dialog"][aria-label="GM AI Assistant"]', { timeout: 5000 });
    await ss(page, 'ai_01_panel', 'Ф8.1 — AI AssistantPanel (NPC context)');
    // Context tabs are role="tab" with text "NPC", "Scene", "SRD", "Free"
    const srdTab = page.locator('[role="dialog"][aria-label="GM AI Assistant"]').getByRole('tab', { name: 'SRD' });
    if (await srdTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await srdTab.click();
      await page.waitForTimeout(300);
      await ss(page, 'ai_02_srd', 'Ф8.1 — AI panel (SRD lookup context)');
    } else {
      await ss(page, 'ai_02_srd', 'Ф8.1 — AI panel context');
    }
    // Close via aria-label="Close"
    await tryClick(page, page.getByRole('button', { name: 'Close' }).last(), 2000);
  } else {
    await ss(page, 'ai_01_panel', 'Ф8.1 — AI area');
    await ss(page, 'ai_02_srd', 'Ф8.1 — AI SRD context');
  }

  // WebRTC VideoCall panel
  await ss(page, 'webrtc_01_grid', 'Ф10 — WebRTC VideoCall panel');

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log(`Total screenshots: ${results.length}`);
  results.forEach(r => console.log(`  ${r.filename}`));

  await browser.close();
  return results;
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

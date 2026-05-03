# Block 7 — Lobby + Invite Flow

**Дата:** 2026-05-03  
**Раунд:** Round 2 (re-run після rate-limit kill)  
**Тестувальник:** QA Explorer Agent  
**Акаунт GM:** block4r2qa@test.local  
**Акаунт Player:** b6testuser@test.local (створений під час тесту)  
**URL:** http://localhost:5173 / API: http://localhost:4000  

---

## Важливе обмеження тесту

Всі 3 вкладки Tab 1/2/3 перебувають в одному вікні браузера → спільний `localStorage`. Логін іншого користувача перезаписує `vtt_refresh_token` — це обмеження single-browser тесту, не баг платформи. WSS real-time sync між різними сесіями потребує реального multi-browser / incognito тесту.

---

## 7.1 — Lobby UI (GM-side)

**Стан середовища:** Обидві кімнати з Block 6 присутні: `Gamma Dungeon - RENAMED` (D&D 5E) + `Beta One-Shot` (Pathfinder). Використовуємо Gamma Dungeon.

**Lobby GM-side спостереження:**
- Header: `← Back` | `Gamma Dungeon - RENAMED` | `D&D 5e` | tab `Lobby` | tab `Invite Players`
- Status stepper: `✓ Authenticating` | `✓ Loading scene` | `⟳ Opening WS channel` (spinner НЕ зупиняється)
- Scenes: "No scenes — create the first!" з `+ Create Scene`
- Members: `MEMBERS · 1` → `Game Master | Block4 Tester`
- `Start Session` button
- `Your role: Game Master`

**⚠️ KNOWN ISSUE (не новий):** "Opening WS channel" spinner крутиться нескінченно. З code review (`ConnectionStepper.tsx:61`): спінер `'active'` доки `socketConnected` не стане `true`. Підключення WS відкривається, але `socketConnected` не підтверджується → spinner залишається.

**Скрін:** `ss_2449l0dce` (lobby_gm_initial)

---

## 7.2 — Invite Link Generation (BUG-005 verify)

**Дія:** Клік на tab `Invite Players`.

**Результат:**
- `Player: Copy` і `Observer: Copy` з'явились в header ✅
- Network: `POST /api/rooms/a719a8fe-.../invites → 200` ВІДРАЗУ (без 401 retry) ✅
- Console: жодних помилок ✅

**BUG-005 STATUS: ✅ FIXED** — перший запит генерації invite повертає 200 без race condition 401.

**Токени (з button title attributes):**
- Player invite: `http://localhost:5173/?invite=943f290d40cabae1a1bfa510f4b9a7a6f387a0b1790f7a0b0601d524ccc136b4` (64-char hex ✅)
- Observer invite: `http://localhost:5173/?invite=4572f4319fb2a386468f21bbbeb760af622205dbfd6c286b0ca780494aa062cd` (64-char hex ✅)

**⚠️ DESIGN ISSUE — Invite URL не відображається в UI:**
- Обидва посилання показуються лише у `title` attribute кнопки Copy, не як visible text
- Користувач не може перевірити своє посилання перед копіюванням

**Toast "Copied":** не зафіксовано — toast може з'являтись і зникати швидко; потребує human verification.

**Скрін:** `ss_2986euqlt` (invite_links_panel)

---

## 7.3 — Player Invite Flow (BUG-001 verify)

### 7.3.1 — Unauthenticated Player на Player invite URL

**Дія:** Tab 2 навігація на `/?invite=943f290d...` (clear localStorage → navigate).

**ЗНАХІДКА 🔴 — BUG-007-B7 NEW: Player invite URL → Observer form**

Unauthenticated користувач на **Player invite URL** бачить форму "Join as Observer" з pre-filled invite code.

Root cause (з `App.tsx:94-103`):
```ts
// Wave 2.2 — Observer invite pre-fill: if unauthenticated and ?invite= is present,
// switch to observer form and pre-fill the invite code.
useEffect(() => {
  if (status === 'authenticated') return;
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  if (!invite) return;
  setAuthView('observer');  // ← ЗАВЖДИ переключає на observer, незалежно від типу токена
  dispatch(setPrefilledInviteCode(invite));
}, [status, dispatch]);
```

Проблема: Wave 2.2 фіксить BUG-002 (Observer invite URL), але вводить нову проблему — **Player invite URL теж перенаправляється на Observer форму**. Система не розрізняє тип токена на клієнтській стороні (і правильно — обидва токени мають формат `?invite=TOKEN`).

**Наслідок:**
1. Уповноважений Player відкриває свій invite link → бачить "Join as Observer" (плутанина!)
2. Є "Back to Login" для переходу до форми логіну з контекстом invite — але UX надзвичайно заплутаний
3. Якщо Player виконає "Join as Observer" з PLAYER токеном → server 404/400 (неправильний endpoint)

**Скрін:** `ss_7595l1u3k` (player_invite_shows_observer_form)

---

### 7.3.2 — Player Login після "Back to Login"

**Дія:** Клік "Back to Login" → Login form показує "Invite code filled in automatically" + "Join as Observer" link → Заповнити credentials `b6testuser@test.local` / `password123` → Sign In.

**Результат:**
- Login → автоматичний `POST /api/rooms/join → 200` ✅
- Player потрапляє в Lobby "Gamma Dungeon - RENAMED" ✅
- **MEMBERS · 2**: `Game Master | Block4 Tester` + `Player | B6 Test User` ✅
- `Your role: Player` ✅
- URL очищається від `?invite=` ✅

**BUG-001 STATUS (join flow): ✅ FIXED** — membership записується в БД, Player бачить себе в Lobby.

**Скрін:** `ss_6463go4sm` (player_in_lobby_members_2)

---

### 7.3.3 — GM-side WSS Verification

**Обмеження:** Single-browser test — Tab 1 і Tab 2 в одному вікні, спільний localStorage. Коли Tab 2 зробив login як Player, token в localStorage перезаписався. Tab 1 React Redux state залишився в cached GM state, але реальна сесія вже Player.

**Спостереження Tab 1 (після Player join):** MEMBERS · 1, тільки GM видно.

**Висновок:** WSS real-time update НЕ підтверджено через single-browser limitation.  
**❓ needs real multi-browser verification** — необхідний тест з реальним incognito вікном або окремим браузером.

**Скрін:** `ss_8796kkklz` (gm_tab_after_player_join)

---

### 7.3.4 — F5 Player (BUG-001 F5 symptom)

**Дія:** navigate на `http://localhost:5173/` (аналог F5 в MCP).

**Результат:**
- Player потрапляє на Dashboard (My Rooms) ❌ — не залишається в Lobby!
- Toast: "Server error. Please try again later." ❌
- Network: `POST /api/auth/refresh → 500` (intermittent, R2-MIN-002)
- "Invited 1" tab: кімната Gamma Dungeon видима з "Role: Player", 2 members, обидва аватари ✅

**BUG-001 STATUS (F5 behavior): ❌ REGRESSION** — Membership в БД є (Invited tab показує кімнату), але F5 відправляє на Dashboard замість Lobby.

**Root cause:** App.tsx Line 149: `inviteJoining || observerLoadingRoom` показує `BootstrapLoader`, але при F5 (cold reload) `currentRoom` = null → App.tsx рендерить Dashboard бо `status === 'authenticated'` але нема автоматичного редіректу до збереженої room membership. Немає логіки "якщо у користувача є active membership — відкрити останню кімнату".

**⚠️ ПРИМІТКА (BUG-007 lesson):** navigate у MCP ≈ F5 keypress, але не ідентично. Потрібно human verification на реальному F5. Поведінка може відрізнятись через різну обробку history state.

**Скрін:** `ss_5469muuhh` (player_after_f5_dashboard_with_invited)

---

### 7.3.5 — Player "Open" з Invited tab

**Дія:** Click "Open" на кімнаті в Invited tab.

**Результат:**
- Lobby відкривається з MEMBERS · 2 ✅
- Role: Player ✅
- Membership відновлено після переходу ✅

---

## 7.4 — Observer Invite Flow (BUG-002 + BUG-003 verify)

### 7.4.1 — Observer на Observer invite URL (unauthenticated)

**Дія:** Tab 3, clear localStorage, navigate на `/?invite=4572f431...` (observer URL).

**Результат:**
- "Join as Observer" форма з subtitle "Invite code filled in automatically. Enter your name." ✅
- Invite code pre-filled ✅
- "Back to Login" link ✅

**BUG-002 STATUS: ✅ FIXED** — Observer URL показує Observer форму з pre-filled code.

**Скрін:** `ss_0324wzabw` (observer_entry_prefilled)

---

### 7.4.2 — Submit Observer

**Дія:** Your Name = "QA Observer R2" → Connect.

**Результат:**
- Observer в Lobby Gamma Dungeon ✅
- Network: `POST /api/rooms/join-invite → 201` (окремий endpoint для observer) ✅
- "Invite Players" tab ВИДИМИЙ в header для Observer ❌ (має бути GM-only)

**⚠️ NEW BUG:** Observer бачить "Invite Players" tab. Це UI вразливість — observer міг би відкрити invite UI і побачити GM-посилання.

**MEMBERS · 2** — Observer НЕ в списку members (тільки GM + Player). Observer не показується як член — це може бути design intent або bug.

**Скрін:** `ss_2119vk4pe` (observer_in_lobby)

---

### 7.4.3 — Observer JWT Payload Analysis (BUG-003 verify)

**Метод:** Refresh token → отримати access token → decode payload.

```json
{
  "sub": "ed3aa0c0-ed95-450f-9b91-714aa19147e7",
  "role": "Player",
  "sid": "22300abb-09c1-49ac-bc98-f2fc91af9343",
  "iat": 1777819014,
  "exp": 1777819914
}
```

**BUG-003 STATUS: ❌ CRITICAL SECURITY BREACH — NOT FIXED**

- `role: "Player"` — замість `role: "observer"` або аналогу ❌
- Відсутній `boundRoomId` в JWT payload ❌
- Observer має повні Player-рівня привілеї в JWT

Wave 1.2 plan передбачав додати `role: 'observer'` + `roomId: <bound room>` в JWT — це **НЕ реалізовано**.

---

### 7.4.4 — Observer RBAC Security Tests

**Test 1: GET /api/rooms з Observer token**
```
Response: 200 []
```
❌ Очікується: **403 FORBIDDEN**. Observer може робити GET на список кімнат.

**Test 2: POST /api/rooms (room creation) з Observer token**
```
Response: 201 Created
Body: {"id":"a5eb657d-...","name":"Observer Hack Room","gameSystem":"D&D 5E","status":"lobby","ownerId":"ed3aa0c0-...","members":[{"userId":"ed3aa0c0-...","name":"QA Observer R2","role":"GM"}],...}
```
❌ **CRITICAL**: Observer може створювати кімнати і стати їх GM!  
Порушує Bible §2.18 RBAC + §3 (Observer = read-only).

**Test 3: GET /api/rooms/a719a8fe-... (інша кімната)**
```
Response: 200 (повні дані Gamma Dungeon)
```
❌ Observer може читати дані БУДЬ-якої кімнати (cross-room data access).

---

### 7.4.5 — Observer UI Scope Navigation

**Back button:** `window.history.back()` → Observer form (не Dashboard) — частково краще ніж R1 де кидало на Dashboard ✅ (але це через history state, не справжнє enforcement)

**Navigate до `/` (direct):** → Landing page (не Dashboard) ✅ — тому що localStorage було очищено перед тестом, і немає сесії.

**Важливо:** якщо б Observer мав активну сесію (токен в localStorage) і навігував на `/`, він би потрапив на Dashboard як звичайний user (бо JWT має `role: Player`). Це й є root cause BUG-003.

**Скрін:** `ss_46471ewb2` (observer_back_to_form)

---

## 7.5 — Multi-user State Sync

**Обмеження:** Повноцінний тест неможливий через single-browser session sharing.

**Часткові спостереження:**
- Player бачить MEMBERS · 2 (GM + Player) ✅
- Observer бачить MEMBERS · 2 (GM + Player) — без себе в списку ⚠️
- GM Tab 1 (cached state) бачить MEMBERS · 1 — real-time update не підтверджено

**7.5.2 — GM Kick/Block Player:** UI не містить "Kick" / "Block" опцій поряд з member в Lobby. Функціональність відсутня.

**7.5.3 — Leave room (Player):** UI не містить "Leave room" кнопки в Lobby. Функціональність відсутня.

---

## 7.6 — Edge Cases

### 7.6.1 — Invalid Invite Token

**Дія:** Navigate `/?invite=0000...0000` (64 нулі), вписати ім'я, Submit.

**ЗНАХІДКА 🔴 — NEW BUG: Invalid invite → BootstrapLoader**

Результат: BootstrapLoader "Connecting to server..." → "Server is waking up, hold on..." + "Try again".

Очікується: UI feedback "Invalid invitation link" або inline error.

Це той самий BootstrapLoader regression що R2-BUG-004/005 — тепер і для Observer join flow.

**Root cause:** `apps/client/src/store/session.ts` — observer join rejected → `state.status = 'error'` → App.tsx:149 → BootstrapLoader.

**Скрін:** `ss_8250wocgy` (invalid_invite_bootstrap_loader)

### 7.6.2 — Прострочений токен

❓ defer — неможливо перевірити без чекання TTL.

### 7.6.3 — GM на власний invite URL

**Результат:** Після session overwrite від Observer tab — не вдалося протестувати чисто. GM сесія була перезаписана observer session в localStorage. Тест вимагає real multi-browser setup.

---

## 7.7 — ТАКОЖ ЗНАЙДЕНО: Authenticated User + Observer Token → Toast Storm

**Дія:** Tab 3 (з активним `b6testuser` session) → navigate на Observer invite URL.

**Результат:** Показується Dashboard з **17+ помилок** "Invite link is invalid or expired" одночасно!

**Root cause:** `App.tsx:113-140` — Wave 2.1 useEffect при `status === 'authenticated'` бере `?invite=` з URL і відразу робить `POST /api/rooms/join`. Але observer token не приймається endpoint `/api/rooms/join` → rejected → toast. **Без debounce** — multiple rapid renders (React Strict Mode + effects) → multiple fetches → multiple toasts.

Це нова, серйозна регресія для UX: якщо залогінений user відкриє посилання на observer invite, він отримає flood of error toasts.

---

## Підсумок по BUG-001..005

| Bug | Status | Деталі |
|-----|--------|--------|
| **BUG-001** | ⚠️ PARTIAL | Join flow: ✅ FIXED (membership в БД, Player в Lobby). F5: ❌ REGRESSION (Dashboard замість Lobby). WSS: ❓ needs multi-browser |
| **BUG-002** | ✅ FIXED | Observer URL → Observer form з pre-filled code. Але Player URL теж показує Observer form (нова проблема) |
| **BUG-003** | ❌ CRITICAL OPEN | JWT `role: "Player"` замість "observer". Нема `boundRoomId`. POST /api/rooms → 201 (observer може створювати кімнати) |
| **BUG-004** | ✅ FIXED (підтверджено з Block 4/5) | 500 на довгих іменах кімнат → 400 |
| **BUG-005** | ✅ FIXED | Перший invite generation → 200 відразу (no 401 race) |

---

## Нові знахідки Block 7

### B7-BUG-001 🔴 — Player invite URL → Observer form (wrong routing)
- **Severity:** High
- Unauthenticated user на Player invite URL бачить "Join as Observer" замість Login
- Root cause: `App.tsx:101` — `setAuthView('observer')` для БУДЬ-ЯКОГО `?invite=`, включно з Player URL
- Fix: передавати тип токена в URL (`?invite=TOKEN&type=player`|`observer`), або робити lookup перед відображенням форми

### B7-BUG-002 🔴 — BUG-003 REGRESSION: Observer JWT = Player privileges
- **Severity:** Critical (security)
- Observer token `role: "Player"`, немає `boundRoomId`
- POST /api/rooms → 201 (room creation confirmed)
- GET /api/rooms → 200 (list access confirmed)
- GET /api/rooms/:id → 200 (cross-room access confirmed)
- Fix: `issueObserverTokens()` має видавати JWT з `role: "observer"` + `boundRoomId: roomId`. Middleware на `/api/rooms` POST/GET має перевіряти роль.

### B7-BUG-003 🔴 — Invalid Observer invite → BootstrapLoader (not inline error)
- **Severity:** High
- Invalid token submit → BootstrapLoader "Server is waking up"
- Same root cause as R2-BUG-004/005 — `session.status = 'error'` shared between auth errors and network errors
- Fix: окремий error state для observer join failures

### B7-BUG-004 🔴 — Toast Storm: authenticated user + observer invite URL → 17+ error toasts
- **Severity:** High
- Logged-in user navigates to observer invite → App.tsx Wave 2.1 effect fires POST /api/rooms/join with observer token repeatedly → flood of "Invite link is invalid or expired" toasts
- Root cause: no token type distinction + no debounce on join effect
- Fix: check `?invite=TOKEN` type before calling `/join` vs `/join-invite`, або перевіряти чи це observer token перед auto-join

### B7-BUG-001-F5 🐛 — F5 → Dashboard замість Lobby (BUG-001 partial regression)
- **Severity:** Medium-High
- After F5 from Lobby, Player lands on Dashboard instead of Lobby
- Membership IS persisted (Invited tab shows room), but no auto-redirect to last room
- Fix: App.tsx — при `status === 'authenticated'` і відсутності `currentRoom` → fetch member rooms і якщо є active membership → відкрити відповідний Lobby

### B7-MINOR-001 ⚠️ — Observer видно в Lobby але не в MEMBERS list
- **Severity:** Minor — design question
- Observer joined room (201), але не показується в MEMBERS section
- Можна вважати design intent (observers = guests), але потребує clarification

### B7-MINOR-002 ⚠️ — "Invite Players" tab видимий для Observer
- **Severity:** Minor-Medium (UI scope leak)
- Observer бачить "Invite Players" tab — GM-only feature
- Observer не може копіювати посилання через це (ще не перевірено повністю), але tab видимий

### B7-MINOR-003 ⚠️ — "Opening WS channel" spinner не зупиняється
- **Severity:** Low (existing, known from R1)
- `socketConnected` ніколи не стає `true` → spinner крутиться
- Підтверджено з Block 7

---

## Заблоковані тести

- **7.5.2** Kick/Block Player — функціональність в UI відсутня
- **7.5.3** Leave room — функціональність в UI відсутня
- **7.3.3** WSS GM-side real-time — потребує multi-browser
- **7.6.3** GM clicks own invite — session contamination в single-browser test

---

## Рекомендації для Wave 3

**Пріоритет 1 (Critical security):**
1. BUG-003 fix: Observer JWT `role: "observer"` + `boundRoomId`. Server RBAC на `/api/rooms` endpoints.

**Пріоритет 2 (UX блокер):**
2. BUG-001 F5 fix: Auto-redirect Player to their active room Lobby після refresh.
3. B7-BUG-004 fix: Debounce/type-check invite join; або distinguish Player vs Observer URLs.
4. B7-BUG-003 fix: Observer invalid invite → inline error замість BootstrapLoader.

**Пріоритет 3 (UX):**
5. B7-BUG-001 fix: Player URL повинен показувати Login form, не Observer form.
6. B7-MINOR-002: Hide "Invite Players" tab for non-GM roles.

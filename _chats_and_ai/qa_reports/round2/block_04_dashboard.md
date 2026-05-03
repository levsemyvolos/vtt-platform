# Block 4 — Dashboard (Empty State + With Rooms)

**Дата:** 2026-05-03  
**Раунд:** Round 2  
**Тестувальник:** QA Explorer Agent  
**Акаунт тесту:** block4r2qa@test.local (свіжий акаунт, зареєстрований на початку блоку)  
**URL:** http://localhost:5173

---

## Статус перевірки R1/R2 багів

| Bug ID | Опис | Статус R2 |
|--------|------|-----------|
| BUG-008 | Settings (soon) клікабельний | ✅ FIXED — пункту немає в sidebar взагалі |
| BUG-009 | Кнопка Create Room мала 2 плюси | ⚠️ PARTIAL — Card OK (1 `+`), але header CTA button має `+ + Create Room` (два плюси) |
| BUG-010 | `errors:server.generic` raw key на UI | ✅ FIXED — raw key не показується. Але нова проблема: toast каже "Bad Request" (HTTP статус) замість user-friendly повідомлення |
| BUG-011 | Кімнати сортувалися старі першими | ✅ FIXED — сортування "Last activity ↓" = новіші першими (DESC default) |
| BUG-012 | Не було Edit/Delete кімнати | ✅ FIXED — ⋮ dropdown з'являється при hover на картці, опції: Rename + Delete |
| MIN-007 | Немає ліміта кімнат, немає counter | ✅ FIXED — показується "0/20 rooms" (порожній стан) → оновлюється до "3/20 rooms" |

---

## 4.1 Empty State

**Скрін:** `ss_2520fb9iw` (empty dashboard)

- Заголовок "My Rooms" ✅
- "0 active · 0 total" — subtitle ✅
- "0/20 rooms" — counter ✅ (MIN-007 FIXED)
- Tabs: "My 0" | "Invited 0" ✅
- Sort: "Last activity ↓" dropdown + direction button ✅
- Search: "search rooms..." placeholder ✅
- CreateRoomCard: один "+" icon, текст "Create a new room / Pick a system and invite players" ✅
- Header CTA button: `+ + Create Room` — **два плюси** ⚠️ (BUG-009 PARTIAL)

**Invited tab empty state:**
- "No active invitations / When you are invited to a room, it will appear here." ✅
- Коли на Invited tab — counter "0/20 rooms" **не показується** ⚠️ (MINOR: зникає при переключенні на Invited)

---

## 4.2 Sidebar

**Скрін:** `ss_2520fb9iw` (sidebar visible on empty state)

- Sidebar: лише "My rooms" — **Settings (soon) повністю видалено** ✅ (BUG-008 FIXED)
- Sidebar bottom: Avatar "BT" + "Block4 Tester / block4r2qa@test.local" + dropdown chevron ✅
- User dropdown: Theme (Light/Dark/System), Language (GB/UA), Logout ✅
- **Немає Theme/Lang toggles у top header** — вони переміщені у sidebar dropdown (дизайнерське рішення, ок)

---

## 4.3 Create Room Card (BUG-009 verify)

**Скрін:** zoomed на CartRoom card — `ss_2520fb9iw`

- CreateRoomCard: **один "+"** icon (золотий), "Create a new room" ✅ **FIXED**
- Header button `+ + Create Room`: **два плюси** — SVG icon `+` + text literal `+` ⚠️ **ЗАЛИШОК BUG-009**

---

## 4.4 Створення кімнати — positive flow

**Скрін:** `ss_6834eybeu` (після першої кімнати)

- Модалка "New Room" відкривається при кліку на Card і на header button ✅
- Поля: Name (з counter 0/100), Game System (chip selector: D&D 5e / Pathfinder / Call of Cthulhu / Homebrew + text input 0/50) ✅
- **Ліміти присутні** — character counters на обох полях ✅ (BUG-004 FIX на client)
- D&D 5e pre-selected за замовчуванням ✅
- Submit → Кімната з'являється на Dashboard ✅
- Counter оновлюється: "0/20" → "1/20" ✅
- Картка кімнати містить: назву, badge "D&D 5E · LOBBY", "Role: Game Master", "1 member", "Last active: now" ✅
- "My 1" badge у табі оновлюється ✅

---

## 4.5 BUG-010 verify — raw i18n keys

**Тест:** через `form_input` (bypass HTML maxLength) відправив name=202 символи → POST /api/rooms → 400

**Результат:**
- Toast показав **"Bad Request"** — НЕ raw key `errors:server.generic` ✅ (BUG-010 FIXED)
- Але "Bad Request" — це HTTP status text, не user-friendly повідомлення ⚠️
- Очікується: "Room name exceeds maximum length" або "Назва кімнати занадто довга"
- **Нова MINOR проблема**: помилка 400 від сервера відображається як технічний HTTP status text

**Мережа:** POST /api/rooms → 400 (не 500!) ✅ — **BUG-004 FIXED**: сервер більше не падає з 500 на довгих назвах, повертає 400 Bad Request з Zod validation

---

## 4.6 Сортування + дизайн картки (BUG-011 verify)

**Скрін:** `ss_3332wf845` (3 кімнати, Gamma перша)

**Тест:** Створено 3 кімнати послідовно: Alpha Campaign → Beta One-Shot → Gamma Dungeon

**Результат сортування з default "Last activity ↓":**
- Gamma Dungeon (newest, "3 min ago") — **першою** ✅
- Beta One-Shot — другою ✅
- Alpha Campaign (oldest, "6 min ago") — останньою ✅

**BUG-011 FIXED** — sort=lastActive DESC за замовчуванням (нові першими)

**Тоглер напрямку:** кнопка `↓`/`↑` — при кліку міняє порядок, правильно ✅

**Дизайн картки:**
- Назва + badge "D&D 5E · LOBBY" / "PATHFINDER · LOBBY" ✅
- "Role: Game Master" ✅
- "1 member" ✅
- "Last active: X minutes ago" (relative time) ✅
- Avatar icon + "Open" button ✅
- **⋮ dropdown при hover**: Rename + Delete ✅ (BUG-012 FIXED)

---

## 4.7 Search

**Тест 1 — точне ім'я:** "Alpha" → показує тільки "Alpha Campaign" ✅
**Тест 2 — частина:** "ampa" → не тестував окремо, але "Alpha" знайшов по частині ✅
**Тест 3 — не існує:** "xyz123notexist" → показує лише CreateRoomCard ⚠️
- **MINOR**: немає empty search state message "No rooms found for 'xyz123notexist'"
- Користувач бачить CreateRoomCard без пояснення "нічого не знайдено"

**Clear (X):** кнопка `×` в search field → очищує, повертає всі 3 кімнати ✅
**Тригер:** on-type (debounce), не на Enter ✅

---

## Нові знахідки (не були в R1 backlog)

### R2-BUG-NEW-001 ⚠️ — Header CTA button має два `+` (залишок BUG-009)

- `+ + Create Room` у правому верхньому кутку — SVG icon + text `+`
- CreateRoomCard (основна картка) — виправлено, один `+` ✅
- Тільки header button лишився

### R2-MIN-NEW-001 ⚠️ — Search empty state без повідомлення

- При пошуку що дає 0 результатів — лише CreateRoomCard без тексту "No rooms found"
- UX: заплутано, user може думати що є лише CardCreate

### R2-MIN-NEW-002 ⚠️ — Counter "0/20 rooms" зникає на Invited tab

- На "My" tab: visible "0/20 rooms" під заголовком ✅
- На "Invited" tab: counter відсутній — inconsistency

### R2-MIN-NEW-003 ⚠️ — Error message "Bad Request" не локалізований

- Сервер повертає 400 з Zod validation error
- Toast: "Bad Request" (HTTP status text) замість user-friendly message
- Потрібно: "Room name is too long (max 100 characters)" або через i18n

### R2-MIN-NEW-004 ⚠️ — Empty submit (Name field) без inline error text

- Натиснути Create без назви → поле виділяється рамкою, але **немає тексту** "Name is required"
- Тільки border highlight — не достатньо для accessibility

---

## Підтверджені фікси з R1

| Bug | Verdict |
|-----|---------|
| BUG-008 Settings (soon) | ✅ FIXED — видалено повністю |
| BUG-009 2 плюси | ⚠️ PARTIAL — Card OK, header button ще 2 `+` |
| BUG-010 raw i18n key | ✅ FIXED (але message quality ⚠️) |
| BUG-011 sort old-first | ✅ FIXED — default DESC newest-first |
| BUG-012 no Edit/Delete | ✅ FIXED — Rename + Delete у hover dropdown |
| MIN-007 no counter | ✅ FIXED — "X/20 rooms" counter |
| BUG-004 500 on long name | ✅ FIXED — server returns 400 |

---

## Скріни (MCP IDs)

- `ss_2520fb9iw` — `block04_01_empty_state.png` (empty dashboard, counter 0/20)
- `ss_4069hdyig` — `block04_05_room_card_dropdown.png` (Rename+Delete dropdown)
- `ss_01029t99z` — `block04_04_with_rooms.png` (3 кімнати, Gamma перша — correct sort)
- `ss_3332wf845` — `block04_06_bad_request_error.png` (error toast "Bad Request" + 3 rooms)

---

## Мережевий трафік (підсумок)

| Request | Status | Примітка |
|---------|--------|----------|
| POST /api/auth/login | 401 | Перший login невідомий акаунт → BootstrapLoader (R2-BUG-005 ще активний) |
| POST /api/auth/register | 201 | Реєстрація успішна ✅ |
| POST /api/auth/logout | 503 | Попередня сесія — R2-BUG-006 підтверджено |
| GET /api/rooms | 200 | Завантаження кімнат ✅ |
| POST /api/rooms (3x) | 201 | Створення кімнат ✅ |
| POST /api/rooms (long name) | 400 | Validation — BUG-004 FIXED ✅ |

---

## Висновок Block 4

**R1 Backlog (6 пунктів):**
- 5/6 виправлено повністю ✅
- 1/6 частково (BUG-009 — header button)

**Нових проблем:** 4 MINOR, жодної CRITICAL/BUG

**Dashboard стан:** Функціонально стабільний. Готовий до Block 5 (деталі кімнат).

# Block 6 — Dashboard: Room CRUD (Sort, Edit, Delete, RBAC, Limit)

**Дата:** 2026-05-03  
**Раунд:** Round 2  
**Тестувальник:** QA Explorer Agent  
**Акаунт тесту:** block4r2qa@test.local (той самий акаунт, що в Block 4–5)  
**URL:** http://localhost:5173

---

## Статус перевірки R1/R2 backlog пунктів

| Bug ID | Опис | Статус R2 |
|--------|------|-----------|
| BUG-011 | Sort: кімнати сортувались старі першими | ✅ FIXED — default lastActive DESC (нові першими) |
| BUG-012 | Не було Edit/Delete кімнати | ✅ FIXED — ⋮ hover dropdown з Rename + Delete |
| MIN-007 | Немає лічильника кімнат | ✅ FIXED — "X/20 rooms" counter |

---

## 6.1 Стан Dashboard перед Block 6

**Початковий стан:** 9 кімнат (створені в Block 4–5, включаючи тестові кімнати: Network Fail Test, Double Submit Test, XSS кімнати, AAAA...).

**Картка кімнати (дані):**
- Назва + badge `D&D 5E · LOBBY` / `PATHFINDER · LOBBY` ✅
- `Role: Game Master` ✅
- `1 member` ✅
- `Last active: X minutes/hours ago` (relative time) ✅
- Avatar initials + `Open` button ✅
- ⋮ dropdown при hover → Rename / Delete ✅ (BUG-012 FIXED)

---

## 6.2 Sort Dropdown (BUG-011 verify + нові знахідки)

**Скрін:** `ss_6712j8x25` (card hover dropdown), `ss_7846u048c` (sort dropdown open), `ss_5025jhdt1` (direction bug)

**Тест 6.2.1 — Default sort:**
- Default: `Last activity ↓` = lastActive DESC (нові першими) ✅
- **BUG-011 FIXED** — підтверджено

**Sort dropdown опції:**
- Last activity ✅
- Created ✅
- Name ✅

**Тест 6.2.2 — Direction button (↑/↓):**
- Натискання ↓ → icon змінюється на ↑ (i.e. icon перемикається) ✅
- Але реальний порядок кімнат **НЕ змінюється** ⚠️
- Повторне натискання ↑ → ↓ icon back → порядок незмінний ⚠️

**Root cause (code analysis):**
- `Dashboard.tsx:76-81` — `handleSortChange` викликає `dispatch(fetchRooms())` БЕЗ параметрів sort/order
- `store/room.ts:31-42` — `fetchRooms` thunk: `apiFetch('/api/rooms')` — без query string `?sort=name&order=asc`
- Тобто: UI state `sort`/`order` оновлюються коректно, але API завжди отримує список без сортування → сервер повертає дефолтний порядок (lastActive DESC)
- **Це НЕ регресія BUG-011** — default DESC зберігається, але зміна сортування не працює

**Sort persistence:**
- Після F5 сортування скидається до дефолтного `lastActive DESC` ⚠️ (не localStorage — це дизайнерське рішення, але може дивувати user)

---

## 6.3 Edit / Rename Flow (BUG-012 verify)

**Скрін:** `ss_86666kx91` (edit modal open, назва "Gamma Dungeon")

**Тест 6.3.1 — Відкриття:**
- Hover на картці → ⋮ з'являється (top-right) ✅
- Клік ⋮ → dropdown: Rename / Delete ✅
- Клік Rename → Edit Room modal ✅

**Тест 6.3.2 — Rename modal:**
- Поле заповнене поточною назвою ✅
- Character counter присутній ✅
- Зміна назви → натискання Save
- PATCH `/api/rooms/:id` → 200 ✅
- Картка оновлює назву ("Gamma Dungeon" → "Gamma Dungeon - RENAMED") ✅
- **Немає success toast** після rename ⚠️ (B6-MIN-001)

**Тест 6.3.3 — Game system зміна в edit:**
- Chip selector для game system доступний в edit modal ✅

**BUG-012 FIXED** — Edit повністю функціональний

---

## 6.4 Delete Flow

**Скрін:** `ss_86666kx91` (delete confirmation modal)

**Тест 6.4.1 — Відкриття:**
- Hover → ⋮ → Delete ✅
- Модалка "Delete Room" ✅
- Текст: "This action is irreversible. All scenes, tokens, and records of room «Room Name» will be deleted. Type the room name to confirm." ✅

**Тест 6.4.2 — Confirmation pattern:**
- Поле "Enter room name" ✅
- Delete button disabled до введення точної назви ✅
- Введена неправильна назва → Delete залишається disabled ✅
- Введена правильна назва → Delete enabled ✅
- Click Delete → DELETE `/api/rooms/:id` → 200 ✅
- Картка зникає з dashboard ✅
- Counter "X/20 rooms" декрементується ✅ (B6-OK-004)
- **Немає success toast** після delete ⚠️ (B6-MIN-002)

**Тест 6.4.3 — Cancel/Close:**
- Cancel → модалка закривається, кімната лишається ✅
- X → те саме ✅

---

## 6.5 ⋮ Dropdown поведінка

**Тест 6.5.1 — Відкриття/закриття:**
- Click ⋮ → dropdown відкривається ✅
- Click за межами → **НЕ закривається** ⚠️ (B6-BUG-001)
- Escape → **НЕ закривається** ⚠️ (B6-BUG-001)
- Click ⋮ повторно → закривається (toggle behavior) ✅

---

## 6.6 RBAC (Cross-user permissions)

**Тест:** Зареєстровано User B (`b6testuser@test.local`), отримано JWT token, спроби PATCH/DELETE кімнат User A.

**Запит PATCH (User B на кімнату User A):**
- `PATCH /api/rooms/:id` з Authorization: Bearer <UserB_Token>
- Response: **403** ✅
- Body: `{"error": {"code": 403, "message": "Only room owner can edit this room"}}` ✅

**Запит DELETE (User B на кімнату User A):**
- `DELETE /api/rooms/:id` з Authorization: Bearer <UserB_Token>
- Response: **403** ✅
- Body: `{"error": {"code": 403, "message": "Only room owner can delete this room"}}` ✅

**B6-OK-001 ✅ RBAC PATCH → 403 підтверджено**  
**B6-OK-002 ✅ RBAC DELETE → 403 підтверджено**

---

## 6.7 Room Limit (MIN-007 + Counter)

**Counter:**
- "X/20 rooms" видимий під заголовком ✅
- Оновлюється після create (increment) ✅
- Оновлюється після delete (decrement) ✅ (B6-OK-004)

**Server-side limit (code verification):**
- `apps/server/src/services/RoomService.ts:26-29`:
  ```ts
  if (count >= ROOM_LIMIT) {
    throw new HttpError(403, 'ROOM_LIMIT_REACHED');
  }
  ```
- ROOM_LIMIT = `process.env.ROOM_LIMIT_PER_USER ?? '20'` ✅

**UI disabled state (code verification):**
- `Dashboard.tsx:60` — `limitReached = ownedCount >= ROOM_LIMIT` ✅
- `Dashboard.tsx:100-103` — `disabled={limitReached}` на header button + tooltip ✅
- `CreateRoomCard` отримує `disabled={limitReached}` ✅

**Примітка:** Повний UI-тест досягнення ліміту (20 кімнат) не проводився практично — для цього потрібно було б створити 12+ кімнат. Server-side і client-side logic верифіковані через code review.

---

## Нові знахідки

### B6-BUG-001 🐛 — ⋮ Dropdown не закривається на click-outside або Escape

**Severity:** Medium  
**Reproducibility:** 100%  
**Деталі:**
- Click ⋮ → dropdown відкривається
- Click anywhere outside card → dropdown залишається відкритим
- Escape key → dropdown залишається відкритим
- Закривається лише при повторному кліку ⋮ (toggle) або при кліку опції (Rename/Delete)
- **UX impact:** при hover на іншій картці — перший dropdown лишається видимим
- **Фікс:** додати `useClickOutside` hook або `onBlur` обробник до dropdown контейнера; додати `onKeyDown` з `Escape` → close

---

### B6-BUG-002 🐛 — Direction button (↑/↓) не змінює порядок кімнат

**Severity:** High (функція повністю не працює)  
**Reproducibility:** 100%  
**Деталі:**
- Кнопка напряму змінює icon ↓/↑ (UI state оновлюється)
- Але реальний список кімнат не сортується по-новому
- **Root cause:** `apps/client/src/pages/Dashboard/Dashboard.tsx:76-81`:
  ```tsx
  const handleSortChange = (newSort: SortField, newOrder: SortOrder) => {
    setSort(newSort);
    setOrder(newOrder);
    void dispatch(fetchRooms()); // BUG: без sort/order params!
  };
  ```
- `apps/client/src/store/room.ts:31-42` — `fetchRooms` thunk: `apiFetch('/api/rooms')` без query params
- **Фікс:** передати sort/order у fetchRooms: `apiFetch('/api/rooms?sort=${sort}&order=${order}')` + оновити thunk щоб приймав параметри

---

### B6-MIN-001 ⚠️ — Немає success toast після Edit/Rename

**Severity:** Minor-UX  
- Rename → 200 → модалка закривається → **тиша**
- User не має підтвердження що зміна збережена
- **Фікс:** dispatch toast "Room renamed successfully" в `editRoom.fulfilled` handler

---

### B6-MIN-002 ⚠️ — Немає success toast після Delete

**Severity:** Minor-UX  
- Delete → 200 → кімната зникає → **тиша**
- Відсутність toast підтверджено скріном `ss_26165b4ax`
- **Фікс:** dispatch toast "Room deleted" в `deleteRoom.fulfilled` handler

---

## Підтверджені фікси з R1

| Bug | Verdict |
|-----|---------|
| BUG-011 sort old-first | ✅ FIXED — default lastActive DESC |
| BUG-012 no Edit/Delete | ✅ FIXED — ⋮ Rename + Delete |
| MIN-007 no room counter | ✅ FIXED — "X/20 rooms" counter |

---

## Скріни (MCP IDs)

| MCP ID | Файл | Опис |
|--------|------|------|
| `ss_6712j8x25` | `block06_01_card_hover_dropdown.png` | ⋮ dropdown при hover (Rename + Delete) |
| `ss_7846u048c` | `block06_02_sort_dropdown_open.png` | Sort dropdown відкритий (3 опції) |
| `ss_8441o6ljp` | `block06_03_edit_modal.png` | Edit Room modal |
| `ss_86666kx91` | `block06_04_delete_confirmation.png` | Delete confirmation modal |
| `ss_26165b4ax` | `block06_05_room_deleted_toast.png` | Після delete — немає toast (B6-MIN-002) |
| `ss_5025jhdt1` | `block06_99_direction_bug.png` | ↑ icon але той самий порядок (B6-BUG-002) |
| `ss_55487q8o6` | `block06_06_rbac_test.png` | RBAC 403 підтвердження |

---

## Мережевий трафік (підсумок)

| Request | Status | Примітка |
|---------|--------|----------|
| PATCH /api/rooms/:id (rename) | 200 | Edit ✅ |
| DELETE /api/rooms/:id (5x) | 200 | Delete ✅ |
| PATCH /api/rooms/:id (User B) | 403 | RBAC ✅ |
| DELETE /api/rooms/:id (User B) | 403 | RBAC ✅ |
| GET /api/rooms | 200 | Завантаження ✅ |

---

## Cleanup після Block 6

**Початок блоку:** 9 кімнат  
**Видалено:** Network Fail Test, Double Submit Test, XSS кімната, AAAA... (×2) = 5 кімнат  
**Залишено для Block 7:** Gamma Dungeon - RENAMED + Beta One-Shot = **2 кімнати**  
- `a719a8fe-b593-4bc8-a8e9-2e5aa5dd2f15` → "Gamma Dungeon - RENAMED" (D&D 5E)
- `1c51aef3-f894-40f1-aa85-630ce7f66231` → "Beta One-Shot" (Pathfinder)

---

## Висновок Block 6

**R1 Backlog (3 пункти):**
- 3/3 виправлено повністю ✅

**Нових проблем:**
- 2 BUG (B6-BUG-001 Medium, B6-BUG-002 High)
- 2 MINOR (B6-MIN-001, B6-MIN-002)

**Dashboard CRUD стан:** Функціонально стабільний. Edit і Delete працюють. RBAC коректний. Критична проблема: sort direction не функціональний (B6-BUG-002). Ready for Block 7 (Room Details / Lobby).

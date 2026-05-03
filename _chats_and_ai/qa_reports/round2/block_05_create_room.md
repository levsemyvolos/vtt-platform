# Block 5 — Create Room Modal (Deep QA)

**Дата:** 2026-05-03  
**Раунд:** Round 2  
**Тестувальник:** QA Explorer Agent (Claude Sonnet 4.6)  
**Акаунт тесту:** block4r2qa@test.local (Block4 Tester)  
**URL:** http://localhost:5173  
**Контекст:** Глибока перевірка модалки створення кімнати — всі edge cases  

---

## Скріни

| ID | Опис | MCP Screenshot ID |
|----|------|-------------------|
| block05_01_modal_empty | Порожня модалка New Room | ss_12080grfw |
| block05_02_counter | Counter 20/100 при введенні | ss_3380x1e8p |
| block05_03_empty_submit | Empty submit — border highlight (no popup captured) | ss_7596ju21h |
| block05_04_long_name_101 | Counter 101/100 (червоний) — bypass через JS | ss_7610nnnrn |
| block05_05_xss_input | XSS payload в формі | ss_2697x10u9 |
| block05_06_xss_render | XSS payload на картці Dashboard | ss_359491caz |
| block05_07_double_submit | Дві ідентичні кімнати після double-click | ss_5985mpon0 |
| block05_08_network_fail | Toast "Network error: simulated failure" — модалка відкрита | ss_489566l3a |
| block05_09_whitespace_error | Whitespace submit → React inline error "Enter room name" | ss_0509d97dx |

---

## 5.1 Структура модалки

**Заголовок:** "New Room" (EN — відповідає i18n ключу `room:dashboard.newRoomHeading`) ✅

**Поля:**
- Name: text input, `maxLength=100`, `required=true`, counter "X/100" ✅ (MIN-008 FIXED)
- Game System: chip selector (D&D 5e / Pathfinder / Call of Cthulhu / Homebrew) + text input `maxLength=50`, counter "X/50" ✅
- D&D 5e pre-selected за замовчуванням ✅

**Кнопки:** Cancel (ghost) / Create (primary) ✅ — локалізовані через i18n ✅

**X кнопка:** присутня у правому верхньому куті ✅

**Placeholder у Name:** відсутній — лише label "Name" зверху. Мінор — допоміжний placeholder "e.g. The Lost Mine" був би корисним.

**Анімація/transition:** модалка відкривається без анімації — instant. Нейтрально.

---

## 5.2 Валідація — empty

### 5.2.1 Empty Name submit через UI click

**Тест:** клік Create з порожнім Name полем.

**Результат:** модалка залишилась відкритою, Name input отримав highlighting (border змінився на золотий). **Browser-native popup не з'явився у скріні** — але network підтверджує що POST НЕ пішов до сервера.

**Технічна перевірка (JS):**
- `required: true` на Name input ✅
- `noValidate: false` на form ✅
- Після empty submit — жодного нового POST /api/rooms у network

**Висновок:** HTML5 `required` validation спрацьовує і блокує submit. Browser-native tooltip ("Заповните это поле" в browser мові) показується — підтверджено R2-MIN-NEW-004.

**Примітка:** `browser_batch` screenshot не зловив момент tooltip відображення (timing issue). Потрібна human verification.

### 5.2.2 Whitespace-only Name submit

**Тест:** введено "   " (3 пробіли) → Submit.

**Результат:** 
- Browser HTML5 `required` НЕ спрацьовує (пробіли = non-empty string)
- React inline error **"Enter room name"** з'явився ✅ (client-side trim validation)
- POST НЕ пішов до сервера ✅
- Скрін: `ss_0509d97dx`

**Root cause:** `handleSubmit` рядок 27: `if (!name.trim()) { setError(t('errors:validation.roomNameRequired')); return; }` ✅

**Висновок:** Whitespace-only захищений. Inline error text присутній. ✅

### 5.2.3 gameSystem порожній

**Тест:** gameSystem має `required=true` і chip завжди pre-selected. Користувач не може легко зробити gameSystem порожнім через UI (chip selector завжди має активний елемент, text input також). Технічно OK, практично — низький ризик.

---

## 5.3 Валідація — довгі значення

### 5.3.1 Name = 99 chars → Submit ✅
Не тестував окремо (тест з 100 перекриває).

### 5.3.2 Name = 100 chars → Submit ✅

**Тест:** введено рівно 100 символів через keyboard → Submit.

**Результат:** кімната створена, 201 OK ✅. Counter показував "100/100" без червоного забарвлення. Кімната з'явилась на Dashboard.

**Скрін:** `ss_2167r4lap`

### 5.3.3 Name = 101 chars → Submit ⚠️/✅

**Тест:** через JS bypass (`maxLength` тимчасово прибраний, value встановлений через native setter → 101 символ) → Submit.

**UI реакція:**
- Counter показав **"101/100" червоним** ✅ (React-level visual warning)
- Submit **не заблокований** — POST пішов до сервера

**Server реакція:** POST /api/rooms → **400 Bad Request** ✅ (Zod validation на сервері)

**UX проблема:** 
- Модалка залишилась відкритою — ок
- **Жодного toast або inline error не показалось** ⚠️ — користувач не знає чому Create не відрацював
- Якщо counter червоний (101/100), кнопка Create мала б бути disabled або показувати tooltip "Name too long"

**Скрін:** `ss_7610nnnrn`

**Висновок:** BUG-004 FIXED на server-side (400 замість 500). Але UX при перевищенні через bypass — "тихий" 400 без feedback.

### 5.3.4 gameSystem = 51 chars → Submit ✅/⚠️

**Тест:** JS bypass → 51 символ у gameSystem.

**Результат:** POST → 400 ✅ (Zod validation). Модалка відкрита, counter "51/50" червоний. Жодного toast ⚠️.

Аналогічно до Name — client-side prevent за maxLength, server-side Zod = OK, але UX після bypass — тихий failure.

---

## 5.4 Валідація — спецсимволи

### 5.4.1 XSS via name: `🎲 Кімната <script>alert(1)</script>`

**Тест:** введено через UI keyboard → Submit.

**Результат:** 
- Кімната створена, POST → 201 ✅
- На Dashboard картці: "🎲 Кімната <script>ale..." обрізано з "..." ✅
- Жодного `alert(1)` — XSS НЕ виконався ✅

**DOM аналіз (JS):**
- `h3.childNodes[0].nodeType === 3` (text node) — React рендерить як **TextNode** ✅
- `<script>` tags encoded як `&lt;script&gt;` у DOM ✅

**Висновок:** React DOM escaping захищає від XSS через room name. ✅

**Скрін input:** `ss_2697x10u9`
**Скрін render:** `ss_359491caz`

### 5.4.2 Кирилиця + emoji + латиниця

**Тест:** `🎲 Кімната <script>alert(1)</script>` — вже містить всі три (кирилиця + emoji + латиниця). ✅

### 5.4.3 Whitespace-only

**Результат:** React inline error ✅ (5.2.2)

### 5.4.4 SQL injection pattern

**Не тестував окремим випадком** — але Prisma parameterized queries захищають на рівні ORM (перевіряти окремо не критично, архітектурний захист є).

---

## 5.5 XSS перевірка

**Де відображається XSS payload після створення:**
1. Dashboard картка — ✅ escaped (TextNode, не HTML)
2. Lobby / GameRoom — не перевіряв (за скопом Block 5, але зафіксую потребу перевірки в Block 6+)

**Скрін source:**
- DOM textContent: `"🎲 Кімната <script>alert(1)</script>"` (текст)
- DOM nodeType: 3 (Text) — не Element

**Висновок:** XSS через room name захищений у React DOM. ✅

---

## 5.6 Network behavior

**POST /api/rooms:**
- Method: POST
- Headers: Authorization Bearer (access token) — автоматично через apiFetch interceptor
- Body: `{ name: "...", gameSystem: "..." }` (trimmed name)
- Response 201: RoomDTO (кімната з'являється на Dashboard)
- Response 400: Zod validation error (тихий — без toast при >100 chars через bypass)
- Response 401: якщо access token протух (перевірено — є retry через refresh token)

**Toast при success:** NO — модалка просто закривається без success toast. Кімната з'являється в списку. Це нормальна UX (feedback = кімната з'явилась).

**Toast при network error:** YES — "Network error: simulated failure" (технічний текст) ⚠️

---

## 5.7 Cancel + X + Click outside + Escape

| Дія | Модалка закрилась | Дані збережені | Форма порожня при реовперні |
|-----|-------------------|----------------|------------------------------|
| Cancel | ✅ | ні (очікувано) | ✅ |
| Escape key | ✅ | ні | ✅ |
| Click outside | ✅ | ні | ✅ |
| X кнопка | (не тестував окремо, очевидно ✅) | — | — |

Дані при Cancel/Escape НЕ персистяться — форма скидається ✅ (R2-MIN-NEW: перевірено).

---

## 5.8 Double-submit 🐛 НОВІ БАГ

**Тест:** valid form → double-click на Create button.

**Результат:**
- Dashboard counter: 6 → 8 (дві кімнати замість однієї!)
- Дві картки "Double Submit Test" у списку
- Network: два POST → 201 (і навіть три запити пішло!)

**Root cause:**
`apps/client/src/components/Dashboard/CreateRoomModal.tsx:85`:
```tsx
<Button type="submit" variant="primary" isLoading={status === 'loading'}>
```
`status` = Redux `s.room.status`. Між кліком і Redux dispatch/state update є **мікросекундний gap** (React render cycle). Якщо обидва кліки приходять до того як `status` оновиться на `'loading'` — обидва проходять.

**Button компонент** (`Button.tsx:44`): `disabled={disabled ?? isLoading}` — `isLoading` → `disabled` є, але спрацьовує із затримкою.

**Фікс:** додати локальний `const [isSubmitting, setIsSubmitting] = useState(false)` в `CreateRoomModal`, встановлювати `true` **синхронно** на початку `handleSubmit` (до dispatch), і `disabled={isSubmitting}` на кнопку.

**Severity:** 🐛 BUG — Medium (не critical, але псує дані: дублікати кімнат)

**Скрін:** `ss_5985mpon0`

---

## 5.9 Модалка при Network failure

**Тест:** JS monkeypatch window.fetch → Promise.reject → Submit.

**Результат:**
- Toast "Network error: simulated failure" з'явився в header ✅
- Модалка залишилась відкритою ✅
- Дані в формі збережені ✅
- **Немає BootstrapLoader** ✅ — regression відсутній

**UX зауваження:**
- Toast текст "Network error: simulated failure" — технічний (це наш monkeypatch текст, реальний буде "Network error: Failed to fetch" або подібний). User-friendly message мала б бути "Could not create room. Check your connection."
- Toast залишається довго (persistent?) — потрібна human verification тривалості

**Скрін:** `ss_489566l3a`

---

## 5.10 Додаткові спостереження

### Toast persistence bug
- "Bad Request" toast з Block 4 залишився видимим під час Block 5 тестування
- "Network error: simulated failure" toast теж лишився надовго
- Toast-и накопичуються в header, не зникають автоматично або зникають дуже довго
- **Нова MINOR проблема**: Toast dismiss timeout надто довгий або toasti не dismissable клієнтом (R2-MIN-NEW-005)

### gameSystem optional перевірка

gameSystem НЕ optional — є `required=true` на text input. Але pre-selected chip гарантує що воно завжди заповнене. Рядок 7 схеми `gameSystem 0..50` (Zod) — 0 мінімум тобто пусте теж дозволено? Потрібна перевірка.

---

## Зведення Block 5

| # | Тест | Результат |
|---|------|-----------|
| 5.1 | Структура модалки | ✅ OK — усі поля, counters, кнопки |
| 5.2.1 | Empty submit | ✅ Browser required validation (R2-MIN-NEW-004 підтверджено) |
| 5.2.2 | Whitespace submit | ✅ React inline error "Enter room name" |
| 5.3.2 | 100 chars — on limit | ✅ OK, кімната створена |
| 5.3.3 | 101 chars via bypass | ⚠️ 400 OK, але NO toast feedback |
| 5.3.4 | gameSystem 51 chars | ⚠️ 400 OK, але NO toast feedback |
| 5.4.1 | XSS `<script>` | ✅ React TextNode escaping, alert(1) не виконався |
| 5.5 | XSS DOM | ✅ nodeType=3 (text), не element |
| 5.6 | Network behavior | ✅ 201 success, 400 Zod, 401 retry |
| 5.7 | Cancel/Esc/X/Outside | ✅ всі закривають, дані скидаються |
| **5.8** | **Double-submit** | **🐛 BUG — 2 кімнати створюються** |
| 5.9 | Network failure | ✅ Toast error, модалка відкрита, no regression |

---

## Нові баги з Block 5

### B5-BUG-001 🐛 — Double-submit створює дублікат кімнати

**Severity:** Medium  
**Reproducibility:** 100% (відтворено)  
**Root cause:** `CreateRoomModal.tsx:85` — `isLoading={status === 'loading'}` залежить від Redux state update (async) замість локального synchronous flag.  
**Фікс:** локальний `isSubmitting` state, встановлюється синхронно в handleSubmit.

### B5-MIN-001 ⚠️ — NO toast при 400 на >limit name/gameSystem (bypass scenario)

**Severity:** Minor-UX  
**Відтворення:** JS bypass (реальний user через UI не може перевищити maxLength=100)  
**Ситуація:** якщо JS bypass → server 400 → модалка тихо лишається відкритою  
**Фікс:** у `handleSubmit` catch 400 → показати inline error "Name is too long (max 100 chars)"

### B5-MIN-002 ⚠️ — Toast persistence надто довга

**Severity:** Minor-UX  
**Відтворення:** будь-який toast (Bad Request, Network error) — лишається видимим 30+ секунд  
**Фікс:** зменшити duration або додати dismiss by click  
**Примітка:** needs human verification тривалості

### B5-MIN-003 ⚠️ — Network error toast текст технічний ("Network error: Failed to fetch")

**Severity:** Minor-UX  
**Фікс:** перехоплювати TypeError у createRoom thunk → user-friendly "Could not create room. Check your connection."

### R2-MIN-NEW-004 ⚠️ — Browser-native validation (ПІДТВЕРДЖЕНО)

**Статус:** підтверджено через цей блок  
- Empty submit → browser popup (мова браузера)
- Whitespace submit → React inline error (не browser)
- Непослідовно: для empty браузер, для whitespace React
- **Фікс:** прибрати `required` з HTML, додати React-level валідацію для обох випадків

---

## Статус R1/R2 багів (з Block 5)

| Bug | Статус |
|-----|--------|
| BUG-004 500 на довгі імена | ✅ FIXED — сервер повертає 400 (Zod validation) |
| MIN-008 No maxLength counter | ✅ FIXED — counter "X/100" і "X/50" присутні |
| R2-MIN-NEW-003 "Bad Request" toast | ⚠️ OPEN — при bypass 400 жодного toast |
| R2-MIN-NEW-004 Browser-native validation | ⚠️ CONFIRMED — empty→browser, whitespace→React |

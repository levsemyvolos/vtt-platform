# Round 2 — Bugs Backlog

**Створено:** 2026-05-03  
**Принцип:** збираємо знайдене по блоках 1–7, фіксимо хвилею після Block 7.

---

## 🔴 CRITICAL

### R2-BUG-005 — login 401/4xx → BootstrapLoader (regression with R2-BUG-004)

**Знайдено:** Block 3 (agent)  
**Severity:** High (блокує весь login error UX)

**Проблема:**
- Будь-яка помилка логіну (401 wrong password, 401 unknown email) → BootstrapLoader blank screen замість inline error у формі.
- R1: форма показувала "Unauthorized" під полем. Зараз: blank screen + "Server is waking up, hold on..." + "Try again".
- Для відновлення форми потрібно 1-2 натискання "Try again".

**Root cause:**
- `apps/client/src/store/session.ts:163-165` — `login.rejected` → `state.status = 'error'`
- `apps/client/src/App.tsx:149` — `status === 'error'` → `<BootstrapLoader networkError={true} />`
- Той самий root cause що R2-BUG-004 (register) — `status='error'` спільний для auth errors і network errors.

**Файли (для фіксу):**
- `apps/client/src/store/session.ts` — окремий `authError` для form-level vs `networkError` для bootstrap-level
- `apps/client/src/App.tsx` — BootstrapLoader тільки при `status === 'error' && source === 'bootstrap'`

---

### R2-BUG-006 — Logout → 503 (server-side session not invalidated)

**Знайдено:** Block 3 (agent)  
**Severity:** Medium-High (security: refresh token linger in DB after logout)

**Проблема:**
- `POST /api/auth/logout → 503 Service Unavailable` — кожен раз в dev environment.
- `tokenStore.clear()` виконується в client `finally` → client-side tokens cleared ✅
- Але `logout.fulfilled` НЕ вистрілює при throw → Redux `status` залишається 'authenticated' momentarily.
- Server-side session НЕ видаляється з DB при logout → refresh token valid до expiry.

**Файли (для фіксу):**
- `apps/server/src/routes/auth.ts` — перевірити чому Express не відповідає на /logout (jwtAuth race? expired access token?)
- `apps/client/src/store/session.ts` — `logout` thunk: у `catch` теж dispatch `clearSession()`

---

### R2-BUG-001 — Plagiarism Roll20 logo + favicon не оновлено

**Знайдено:** Block 1 (Лев)  
**Severity:** Critical (academic plagiarism + visual identity)

**Проблема:**
- D20-pentagon SVG логотип (створений Wave 5.6) геометрично майже ідентичний фірмовому знаку Roll20 — конкурента-аналога з Розділу 1.2 дипломної.
- Для дипломної роботи це **прямий плагіат**, юридично — потенційне trademark issue.
- `favicon` не оновлений у Wave 5.6 — на вкладці браузера досі дефолтна Vite-іконка.

**Файли (для фіксу):**
- `apps/client/src/components/ui/Logo.tsx` — повний редизайн SVG.
- `apps/client/public/favicon.svg` (або `apps/client/index.html` link rel="icon") — оновити.

**Запропонований редизайн:**
- **Pекомендований варіант — типографічний:** `VTT` як логотип у fantasy/геральдичному шрифті, без icon. Найбезпечніше від plagiarism, professionally виглядає (Linear, Vercel, Stripe).
- Альтернатива: інша геометрія кубика (d4/d8/d6), не pentagon.
- Альтернатива: wireframe 3D-кубик або сюжетна композиція (d20 + меч).

---

## 🐛 BUG

### R2-BUG-002 — Тоглери теми/мови на landing-page видимі, але не реагують

**Знайдено:** Block 1 (Лев)  
**Severity:** Medium

**Проблема:**
- На landing screen ThemeToggle і LanguageSwitcher **видимі** в правому верхньому куті, але **клік нічого не робить**.
- На auth-screens (Login/Register/ObserverEntry) ці ж компоненти працюють коректно.
- Швидше за все різниця у обгортці: на auth-screens вони у `<AuthLayout>`, а на лендінгу — в окремому header без правильного state-binding.

**Методологічна примітка:** агент Round 2 Block 1 verified тоглери ТІЛЬКИ на /login і помилково extrapolював висновок на лендінг. У наступних блоках агенту дано rule: "тестуй на конкретній сторінці, не екстраполюй з сусідньої".

**Файли (для фіксу):**
- `apps/client/src/pages/Landing/Landing.tsx` — перевірити де вмонтовані тоглери, чи правильний onChange handler.
- Може треба обернути в той самий wrapper що і AuthLayout.

---

### R2-BUG-003 — Footer hardcoded "Thesis project · KPI · 2026"

**Знайдено:** Block 1 (Лев)  
**Severity:** Medium (factual error + brand)

**Проблема:**
- Wave 5.6 агент згенерував footer з "КПІ" — Лев не у КПІ, це hallucination.
- Глобальніше: Лев не хоче прив'язки footer до диплому/університету взагалі. Платформа має виглядати як самодостатній продукт.

**Запропонований фікс — Варіант A (мінімалізм, рекомендований):**
```
© 2026 VTT Platform · v0.X.X
```
Read version з `package.json`. Все.

Альтернативи: Варіант B (продуктовий — GitHub/Docs/Privacy links), C (community-tone "Made with ⚔️ for the tabletop RPG community"), D (зовсім без footer на лендінгу — як Linear/Notion).

**Файли (для фіксу):**
- `apps/client/src/pages/Landing/Landing.tsx` — секція footer.
- `apps/client/src/locales/{uk,en}/landing.json` — оновити ключ `landing.footer`.

---

### R2-BUG-004 — 409 "Email exists" → BootstrapLoader (blank screen) замість inline error

**Знайдено:** Block 2 (agent)
**Severity:** Medium-High

**Проблема:**
- При реєстрації з вже існуючим email сервер повертає 409. Але замість inline error "Email already registered" — застосунок переходить у стан BootstrapLoader ("Server is waking up, hold on...") з чорним екраном.
- R1 was: 1-хвилинне зависання "Registering...". R2: зависання немає, але UX гірший — blank screen.

**Root cause:**
- `apps/client/src/store/session.ts:174` — `register.rejected` → `state.status = 'error'`
- `apps/client/src/App.tsx:149` — `status === 'error'` → `<BootstrapLoader networkError={true} />`
- `status='error'` спільний для "server unreachable" (bootstrap) і "register 4xx" (auth form).

**Файли (для фіксу):**
- `apps/client/src/store/session.ts` — додати окремий status/flag для auth errors vs network errors.
- `apps/client/src/App.tsx:149` — умова BootstrapLoader не має включати auth form errors.

---

## 🔴 CRITICAL

### R2-REG-002 — Відсутній Zod schema для POST /api/auth/register (Wave 1.1 gap)

**Знайдено:** Block 2 (agent)
**Severity:** Critical (server crash + DoS vector)

**Проблема:**
- Name 200+ chars → `POST /api/auth/register 500` (Prisma crash з oversized string).
- Password 200+ chars → `POST /api/auth/register 201` accepted (bcrypt DoS vector).
- Email 100+ chars → `POST /api/auth/register 201` accepted (no max length).
- `apps/server/src/routes/auth.ts` — жодного Zod validation middleware.

**Файли (для фіксу):**
- `apps/server/src/routes/auth.ts` — додати `validateBody(registerSchema)` middleware.
- `apps/server/src/schemas/auth.schema.ts` — [NEW] Zod schema з maxLength для name (50), email (254), password (72 — bcrypt limit).

---

## ⚠️ MINOR

### R2-MIN-001 — Browser-native validation замість React inline errors для порожніх полів

**Знайдено:** Block 2 (agent)
**Severity:** Minor (UX inconsistency)

**Проблема:**
- Empty submit: browser tooltip "Заполните это поле." (мова браузера, не UI-мова). Немає React-level inline error.
- Password <8 chars: React inline error "Password must be at least 8 characters" (коректно).
- Непослідовна UX: для одних помилок — browser popup, для інших — inline React.

**Файли:** `apps/client/src/pages/Auth/Register.tsx`

---

### R2-MIN-002 — Інтерміттентний 500 на /api/auth/refresh при F5

**Знайдено:** Block 2 (agent)
**Severity:** Minor (intermittent)

**Проблема:**
- F5 після успішної реєстрації → перший `POST /api/auth/refresh 500`, другий → 200.
- Toast "Server error. Please try again later." спалахує хоча user залишається авторизованим.

---

### R2-MIN-003 — Відсутнє Password confirmation поле

**Знайдено:** Block 2 (agent) (підтверджено з R1 notes)
**Severity:** Minor-UX

---

### R2-MIN-005 — "Try again" потрібен 1-2 рази для відновлення після BootstrapLoader

**Знайдено:** Block 3 (agent)  
**Severity:** Minor-UX

**Проблема:**
- Перший клік "Try again" → 'bootstrapping' (thunk pending), якщо 500 ще раз → залишається на loader.
- Другий клік → зазвичай 200 → відновлює.
- Непередбачувана кількість кліків для відновлення сесії.

**Фікс:** BootstrapLoader має auto-retry після 2-3 сек замість manual "Try again".

---

### R2-MIN-006 — Logout redirect inconsistency (Register form vs Landing)

**Знайдено:** Block 3 (agent)  
**Severity:** Minor-UX

**Проблема:**
- Перший logout (після register): → Register form залишається (SPA state не скинутий).
- Другий logout (нова вкладка): → Landing page коректно.
- `authView` React state не скидається при logout.

**Фікс:** `logout.fulfilled` → `setAuthView('landing')` в App.tsx.

---

### R2-MIN-007 — Немає "Back to landing" посилання на login form

**Знайдено:** Block 3 (agent)  
**Severity:** Minor-UX

**Проблема:**
- Login form: немає явного "← Back" або "Back to landing" посилання.
- Тільки browser Back або вручну navigate.

---

### R2-MIN-004 — Немає "Back to landing" посилання на register form

**Знайдено:** Block 2 (agent)
**Severity:** Minor-UX

---

## ✅ ПІДТВЕРДЖЕНІ ФІКСИ З ROUND 1

| Bug | Verdict | Block |
|-----|---------|-------|
| MIN-002 Landing screen | ✅ Виправлено | 1 |
| BUG-006 Theme split | ✅ Виправлено | 1 |
| MIN-001 Cold start UX | ❓ Defer to Render | 1 |
| MIN-003 Logo | ❌ Open (R2-BUG-001) | 1 |
| MIN-004 Toggles на auth | ⚠️ Частково (R2-BUG-002 на landing) | 1 |
| MINOR-NEW-001 i18n delay | ✅ False positive — закрито | 1 |
| MIN-005 Welcome toast | ✅ "Welcome, R2B2 Tester! Glad to have you here." — toast у bottom-right, ~2-3 сек | 2 |
| BUG-007 F5 race | ❌ **STILL BROKEN** — Лев перевірив руками на localhost: проблема відтворюється, виганяє на login. Агент верифікував false positive (`location.reload()` через JS не еквівалентно реальному F5 keypress). | 3 |
| BUG-006 Theme split | ✅ OK — auth screen theme togglers присутні і робочі | 3 |
| Wave 5.3 i18n guard | ❓ Неможливо верифікувати — masked by R2-BUG-005 | 3 |
| BUG-008 Settings (soon) | ✅ FIXED — видалено з sidebar | 4 |
| BUG-009 2 плюси | ⚠️ PARTIAL — Card OK (1+), header button ще 2+ | 4 |
| BUG-010 raw i18n key | ✅ FIXED (але "Bad Request" замість user message) | 4 |
| BUG-011 sort old-first | ✅ FIXED — default DESC newest-first | 4 |
| BUG-012 no Edit/Delete | ✅ FIXED — hover ⋮ з Rename+Delete | 4 |
| MIN-007 no counter | ✅ FIXED — "X/20 rooms" counter visible | 4 |
| BUG-004 500 on long name | ✅ FIXED — server returns 400 (Zod validation) | 4 |
| BUG-011 sort default DESC | ✅ FIXED — default lastActive DESC підтверджено детально | 6 |
| BUG-012 Edit/Delete | ✅ FIXED — ⋮ Rename + Delete + RBAC 403 на чужі | 6 |
| MIN-007 limit + counter | ✅ FIXED — counter increment/decrement, server-side 403 ROOM_LIMIT_REACHED | 6 |

---

## ⚠️ НОВІ (Block 4)

### R2-BUG-NEW-001 ⚠️ — Header CTA `+ + Create Room` (залишок BUG-009)
**Знайдено:** Block 4  
**Severity:** Low-Visual  
- Кнопка "+ + Create Room" у правому верхньому куті має два плюси: SVG icon + text literal "+"
- CreateRoomCard виправлено (один +), тільки header button лишився
- **Рішення Льова:** прибрати "+" з тексту кнопки, лишити просто "Create Room" (icon + text без додаткового плюсу). Файл: `apps/client/src/pages/Dashboard/Dashboard.tsx` або відповідний i18n ключ кнопки.

### R2-MIN-NEW-001 ⚠️ — Search empty state без повідомлення
**Знайдено:** Block 4  
**Severity:** Minor-UX  
- При пошуку що повертає 0 результатів — лише CreateRoomCard, немає "No rooms found" тексту

### R2-MIN-NEW-002 ⚠️ — Counter "X/20 rooms" зникає на Invited tab
**Знайдено:** Block 4  
**Severity:** Minor-UX  
- На "My" tab counter показується, на "Invited" — відсутній (inconsistency)

### R2-MIN-NEW-003 ⚠️ — Error toast "Bad Request" не локалізований
**Знайдено:** Block 4  
**Severity:** Minor-UX  
- 400 від Zod validation → toast "Bad Request" (HTTP status text)
- Потрібно user-friendly: "Room name is too long (max 100 characters)"

### R2-MIN-NEW-004 ⚠️ — Empty Name submit без inline error text
**Знайдено:** Block 4  
**Severity:** Minor-UX/Accessibility  
- Пустий submit → border highlight, але немає тексту "Name is required"
- **Уточнення (Лев):** користувач бачить browser-native popup "Заповните это поле" російською. Це НЕ те саме що "Bad Request" toast (R2-MIN-NEW-003) — той toast спрацьовує лише коли HTML5 валідація обходиться (наприклад через automated fetch). Реальний user flow — browser-native popup, що ламає UI-мову (рос. з браузера vs UA/EN з UI).
- **Рішення:** прибрати `required` з HTML, додати React-level inline error.

---

## 🆕 НОВІ ЗАУВАЖЕННЯ З HUMAN PASS (Blocks 1-4)

### R2-COPY-001 ⚠️ — EN tagline "tabletop" дублюється
**Знайдено:** Block 1 (Лев human pass)  
**Severity:** Minor (copywriting)  
- Поточний: *"AI-assisted virtual tabletop for tabletop RPGs"*
- "tabletop" повторюється двічі поспіль — режить око.
- **Запропоновано:** *"AI-assisted virtual tabletop for TTRPGs"* — використати загальноприйняту абревіатуру TTRPG (tabletop role-playing games), яку розуміє цільова аудиторія. Або *"AI-assisted virtual table for tabletop RPGs"* (синонім "table" замість "tabletop").
- **Файли:** `apps/client/src/locales/en/landing.json` → ключ tagline

### R2-COPY-002 ⚠️ — UK CTA "Зайти як спостерігач" — потенційний русизм
**Знайдено:** Block 1 (Лев human pass)  
**Severity:** Minor (copywriting + дипломна academic тон)  
- "Зайти" в укр. часто кваліфікується як калька з рос. "зайти" — нормальніше "увійти" або "приєднатися".
- **Запропоновано:** *"Приєднатися як спостерігач"* — натуральне укр., точніше передає семантику (Observer не "входить" в систему — він приєднується до конкретної кімнати без створення акаунту).
- **Файли:** `apps/client/src/locales/uk/landing.json` + `auth.json` (для Observer кнопки на формі)

---

## 🆕 НОВІ (Block 5 — Create Room Modal)

### B5-BUG-001 🐛 — Double-submit створює дублікат кімнати
**Знайдено:** Block 5  
**Severity:** Medium  
**Reproducibility:** 100%  
**Деталі:**
- double-click на Create → 2-3 POST /api/rooms → 201 кожен → дві ідентичні кімнати в списку
- Кнопка не disabled під час pending request (точніше: `isLoading={status === 'loading'}` спрацьовує з затримкою Redux dispatch)
- **Root cause:** `apps/client/src/components/Dashboard/CreateRoomModal.tsx:85` — `status` з Redux store, не локальний synchronous flag
- **Фікс:** локальний `const [isSubmitting, setIsSubmitting] = useState(false)` + `setIsSubmitting(true)` синхронно в handleSubmit + `disabled={isSubmitting}` на кнопку
- **Скрін:** ss_5985mpon0

### B5-MIN-001 ⚠️ — NO feedback при 400 через bypass (>100 chars name)
**Знайдено:** Block 5  
**Severity:** Minor-UX  
- При JS bypass maxLength → submit → server 400 → модалка тихо відкрита, жодного toast або inline error
- Counter "101/100" червоний — це візуальна підказка, але кнопка Create не disabled
- Нормальний user flow не може bypass maxLength=100, тому severity Low для real users
- **Фікс:** у createRoom thunk.rejected handler → show inline/toast "Room name is too long (max 100 chars)"
- **Скрін:** ss_7610nnnrn

### B5-MIN-002 ⚠️ — Toast persistence надто довга
**Знайдено:** Block 5  
**Severity:** Minor-UX  
- Toasti ("Bad Request", "Network error") видимі 30+ секунд, накопичуються
- Потрібна human verification точної тривалості
- **Фікс:** зменшити duration до 4-5 сек або додати dismiss by click

### B5-MIN-003 ⚠️ — Network error toast текст технічний
**Знайдено:** Block 5  
**Severity:** Minor-UX  
- При мережевій помилці: toast "Network error: Failed to fetch" (технічний текст Error)
- **Фікс:** перехоплювати TypeError у createRoom thunk → user-friendly "Could not create room. Check your connection."

### B5-OK-001 ✅ — BUG-004 (500 на довгі імена) FIXED повністю підтверджено
- Name 100 chars → 201 ✅
- Name 101 chars → 400 (Zod) ✅ — не 500
- gameSystem 51 chars → 400 (Zod) ✅ — не 500

### B5-OK-002 ✅ — MIN-008 (no maxLength counter) FIXED підтверджено
- Counter "20/100" для name ✅
- Counter "6/50" для gameSystem ✅
- Counter "101/100" червоним при перевищенні ✅

### B5-OK-003 ✅ — XSS через room name не виконується
- React TextNode escaping ✅
- `<script>alert(1)</script>` рендериться як текст, не HTML ✅

### B5-OK-004 ✅ — Cancel/Escape/Click outside/X закривають модалку
- Дані не зберігаються ✅
- Форма порожня при повторному відкритті ✅

### B5-OK-005 ✅ — Network failure → модалка відкрита (no BootstrapLoader regression)
- Toast "Network error: ..." з'являється ✅
- Модалка не закривається ✅
- Дані в формі збережені ✅

### B5-CONFIRMED ⚠️ — R2-MIN-NEW-004 підтверджено детально
- Empty submit → HTML5 required → browser popup (мова браузера)
- Whitespace submit → React inline error "Enter room name" ✅
- Непослідовний UX: для empty = browser, для whitespace = React

---

### R2-MIN-006 (підтверджено руками) — Logout → Login form, не Landing
**Знайдено:** Block 3 (agent + Лев human pass)  
**Severity:** Minor-UX  
- Підтверджено: після logout користувач опиняється на Login form, не на Landing.
- Це може бути логіка "хочеш швидко зайти знову", але збиває з пантелику бо тільки що вийшов.
- Альтернатива: redirect на Landing з опцією "Sign back in" в банері.

### R2-BUG-004 / R2-BUG-005 (severity correction)
**Знайдено:** Лев human pass Block 2 + 3  
- Технічно екран НЕ повністю чорний — там видно BootstrapLoader зі спінером + "Server is waking up".
- Але Лев підтверджує: **смущає, виглядає як проблема серверу**, а не як помилка форми.
- Severity лишається Medium-High — UX-психологічний impact є.

---

## 🆕 НОВІ (Block 6)

### B6-BUG-001 🐛 — ⋮ Dropdown не закривається на click-outside / Escape
**Знайдено:** Block 6 (agent)  
**Severity:** Medium  
- Click ⋮ → dropdown відкривається коректно.
- Click anywhere outside → лишається відкритим. Escape → лишається відкритим.
- Закривається лише повторним кліком ⋮ (toggle) або вибором опції.
- При hover на іншу картку — попередній dropdown лишається видимим, накладається.
- **Фікс:** додати `useClickOutside` hook + `onKeyDown` Escape handler у `RoomCard.tsx` або в обгортці dropdown.

### B6-BUG-002 🔴 — Sort direction button (↑/↓) не змінює порядок (НЕ працює)
**Знайдено:** Block 6 (agent)  
**Severity:** High  
- Натискання direction button → icon перемикається ↓ ↔ ↑.
- АЛЕ реальний список кімнат не пересортовується. Перемикання sort field (Last activity / Created / Name) теж не працює.
- **Root cause (з code analysis):**
  - `apps/client/src/pages/Dashboard/Dashboard.tsx:76-81` — `handleSortChange` оновлює React state `sort`/`order` але викликає `dispatch(fetchRooms())` БЕЗ передачі параметрів.
  - `apps/client/src/store/room.ts:31-42` — `fetchRooms` thunk робить `apiFetch('/api/rooms')` без query string.
- **Висновок:** sort UI чисто декоративний, default `lastActive DESC` від сервера зберігається. BUG-011 формально fixed (default sort нові першими), але **зміна сортування не працює взагалі** — це нова, окрема проблема.
- **Фікс:** thunk `fetchRooms` має приймати `{ sort, order }` параметри і передавати у URL: `/api/rooms?sort=${sort}&order=${order}`.

### B6-MIN-001 ⚠️ — Немає success toast після Rename
**Знайдено:** Block 6 (agent)  
**Severity:** Minor-UX  
- PATCH 200 → модалка закривається → тиша. User не отримує підтвердження що зміна збережена.
- **Фікс:** dispatch toast у `editRoom.fulfilled`.

### B6-MIN-002 ⚠️ — Немає success toast після Delete
**Знайдено:** Block 6 (agent)  
**Severity:** Minor-UX  
- DELETE 200 → картка зникає → тиша. Той самий патерн що B6-MIN-001.
- **Фікс:** dispatch toast у `deleteRoom.fulfilled`.

---

## 🚧 Не покрито в Block 6 (defer to Block 7 або side-test)

- **WSS broadcast `room:deleted` → друга вкладка:** не тестовано (агент перерваний). Block 7 буде heavy на WSS — там покриється.
- **Реальний UI test 20→21 кімнат:** агент верифікував через code review, не створив 20 вручну. Логіка правильна, але без UI confirmation.

---

## ✅ Block 7 — Lobby + Invite (ЗАВЕРШЕНО 2026-05-03)

**Файл:** `block_07_lobby_invite.md`  
**Статус:** Завершено агентом Round 2 re-run.

### BUG-001..005 R1 статуси після Round 2 Block 7:
- **BUG-001** — ⚠️ PARTIAL: Join flow ✅ FIXED, F5 regression ❌, WSS ❓ multi-browser needed
- **BUG-002** — ✅ FIXED: Observer URL pre-fills invite code
- **BUG-003** — ❌ CRITICAL OPEN: JWT `role: "Player"` (не "observer"), no boundRoomId, room creation 201
- **BUG-004** — ✅ FIXED (підтверджено Block 4/5)
- **BUG-005** — ✅ FIXED: invite generation → 200 без 401 race

### Нові критичні знахідки Block 7:
- **B7-BUG-001** 🔴 — Player invite URL → Observer form (wrong routing, Wave 2.2 side effect)
- **B7-BUG-002** 🔴 — BUG-003 REGRESSION: Observer JWT = Player privileges (POST /api/rooms → 201 confirmed)
- **B7-BUG-003** 🔴 — Invalid Observer invite → BootstrapLoader (same pattern as R2-BUG-004/005)
- **B7-BUG-004** 🔴 — Toast Storm: logged-in user + observer invite URL → 17+ error toasts
- **B7-BUG-001-F5** 🐛 — F5 → Dashboard замість Lobby (BUG-001 partial regression)
- **B7-MINOR-001** ⚠️ — Observer не в MEMBERS list
- **B7-MINOR-002** ⚠️ — "Invite Players" tab видимий для Observer
- **B7-MINOR-003** ⚠️ — "Opening WS channel" spinner не зупиняється

---

## 🆕 НОВІ (Manual exploration Льва, блоки 9+ територія)

> Лев пройшов далі за Block 7 і знайшов це руками. Знаходиться в `_chats_and_ai/qa_reports/round2/bug_reports.md`.

### LEV-MANUAL-001 🔴 — POST /api/assets/uploads + POST /api/assets відсутні
**Знайдено:** Manual (Лев), блок 9 (Scene Editor — AI background)  
**Severity:** Critical (фіча AI background не працює)  
**Симптом:** "Edit Scene" → upload фонового зображення → лоадер зависає або помилка мережі. Сервер 404.  
**Root cause:** Клієнт викликає `POST /api/assets/uploads` (init upload) + `POST /api/assets` (finalize у GCS). У `apps/server/src/routes/assets.ts` та `AssetService` ці методи **відсутні** — реалізовано лише GET.  
**Fix Plan:**
1. Винести типи завантаження у `@vtt/shared` (DTO для init/finalize requests).
2. Додати `initImageUpload` та `finalizeImageUpload` у бекенд `AssetService`.
3. Реалізувати `POST` ендпоінти у `routes/assets.ts` з RBAC (тільки GM кімнати).

### LEV-MANUAL-002 🐛 — Token: нема file upload + сторонні URL не рендеряться (CORS)
**Знайдено:** Manual (Лев), блок 10 (Canvas + tokens)  
**Severity:** High  
**Симптом:** При створенні токена — нема кнопки upload файлу (тільки URL поле). Якщо вставити зовнішній URL картинки — на полотні замість неї кольоровий квадрат.  
**Root cause:**
1. `AddTokenButton.tsx` + `TokenEditModal.tsx` приймають лише string URL, без integration з upload service.
2. Konva `useImage` хук ставить `img.crossOrigin = 'anonymous'`. Без правильних CORS-заголовків від external server браузер блокує — спрацьовує `onerror`.

**Fix Plan:**
1. Інтегрувати `ImageUpload` / `AssetPicker` у форми токенів.
2. Залежність від LEV-MANUAL-001 — після фіксу asset upload токени будуть зберігатись у наш GCS bucket з правильним CORS.

### LEV-MANUAL-003 🐛 — Theme toggle відсутній на game screens
**Знайдено:** Manual (Лев)  
**Severity:** Medium  
**Симптом:** Перемикач теми доступний на Landing, auth screens та Dashboard. **Відсутній** на:
- `RoomLobby.tsx` (кімната очікування)
- `GameRoomTopBar.tsx` (основний екран гри)
- `EditorTopBar.tsx` (редактор сцени)

**Fix Plan (UX-обговорено в bug_reports.md):**
- Рекомендоване рішення: ThemeToggle + LanguageSwitcher у dropdown-меню аватара в `GameRoomTopBar` (як у Dashboard `UserChip`); у `RoomLobby` + `EditorTopBar` — окремі іконки у праву частину панелі.

### LEV-MANUAL-004 🔴 — AI Assistant + згенеровані медіа НЕ зберігаються
**Знайдено:** Manual (Лев), блок 19 (AI Assistant)  
**Severity:** Critical (data loss)  
**Симптом:** Будь-який контент створений через AssistantPanel (LLM чат, згенеровані зображення, музика) "губиться" при F5 або закритті панелі. Виглядає як повна втрата напрацювань.  
**Root cause:**
1. **LLM chat:** зберігається лише в client Redux (`assistant.ts`). У БД нема моделі `AssistantMessage`.
2. **Image/Music:** бекенд зберігає в `AssetRepository.storeAiAsset`, але клієнт (`RecentGenerations.tsx`, History tab) **захардкоджений** на моки. Реальний URL існує лише в локальному React state `imageResult`.
3. **User uploads:** залежить від LEV-MANUAL-001.

**Fix Plan:**
1. Persistence для AI Chat: модель `AiChatHistory` (або розширити `ChatMessage` з режимом `assistant`); endpoint для гідратації при відкритті кімнати.
2. Інтеграція `RecentGenerations.tsx` з `GET /assets?roomId={id}&kind=ai-generated` — виводити останні згенеровані artifacts.

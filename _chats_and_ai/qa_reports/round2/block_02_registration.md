# Block 2 — Реєстрація (Round 2 verification)

**Дата:** 2026-05-03
**URL:** http://localhost:5173/
**Тестувальник:** qa-explorer agent

---

## Agent observations

### 2.1 Перехід до форми реєстрації

- Кнопка "Create Account" на лендінгу — золота, primary CTA, розміщена зліва від "Sign In".
- Клік → форма з'являється на тій самій сторінці (URL залишається `http://localhost:5173/`). Це SPA-рендеринг, **не редирект** на окремий `/register` маршрут.
- Форма: заголовок "Create account", підзаголовок "Authenticate or create a new account".
- Tabs зверху: "Login" (неактивний) | "Register" (активний, bold).
- Поля: **Name** (type=text), **Email** (type=email), **Password** (type=password). Три поля.
- **Немає** Password confirmation — підтвердження паролю не вимагається.
- Labels присутні над кожним полем. Placeholders **відсутні**.
- Кнопка submit: "Register" — золота, fullWidth, primary.
- Посилання назад на лендінг — **відсутнє**. Повернення через вкладку "Login" або Browser Back.
- Посилання на логін — вкладка "Login" (tab-switch), не окреме посилання.
- Console: чиста на момент входу на форму.

### 2.2 Негативні сценарії

#### 2.2.1 Порожня форма → Submit

- Клік "Register" з порожніми полями: форма НЕ відправляється на сервер.
- Підсвічується **золотою рамкою** перше порожнє поле (Name).
- Текстових повідомлень про помилки під полями — **немає**.
- Натискання браузерної кнопки submit показує browser-native tooltip "Заполните это поле." (мова залежить від мови браузера, зараз — російська).
- Механізм: native HTML `required` attribute на всіх трьох inputs — не React-level validation.
- ⚠️ **UX-зауваження**: React-рівня inline-помилок для empty state немає. Validation для empty fields = browser popup тільки. Для password <8 char — є React inline error. Двоякий UX.

#### 2.2.2 Email без @

- Name = "R2B2 Tester", Email = "qwerty", Password = (пусто) → Submit.
- Browser-native validation: tooltip "Адрес электронной почты должен содержать символ "@"..." на email полі.
- Повідомлення коректне за змістом, але мовою браузера (у даному випадку — рос.), а не мовою застосунку.
- React-рівня помилки для invalid email — **немає** (тільки browser native).
- Запит на сервер **не надсилається**.

#### 2.2.3 Короткий пароль

- Name = "R2B2 Tester", Email = "test@test.local", Password = "1" → Submit.
- Форма надсилається (browser validation пропускає — email валідний, name заповнено), але React validate() спрацьовує.
- **Inline error** під password field: "Password must be at least 8 characters" (червоний фон, role="alert").
- Це єдиний сценарій де видно React-level inline error в registration form.
- ✅ Підказка про мінімальну довжину — є і відображається коректно.

#### 2.2.4 Email вже існує (BUG — новий у R2)

**Тест:** Name = "R2B2 Tester", Email = "player@test.local" (відомо що існує), Password = "testpass123" → Submit.

- Сервер повертає `POST /api/auth/register → 409 Conflict`. (Підтверджено network log.)
- **Замість** "Email already registered" error у формі — повний застосунок переходить у стан BootstrapLoader: чорний екран + спінер + "Server is waking up, hold on..." + кнопка "Try again".
- Тобто 409 → `register.rejected` → session.status='error' → App.tsx line 149 рендерить `<BootstrapLoader networkError={true}>`.
- "Try again" натискає bootstrapSession() → запит refresh → відновлює form.
- **Round 1** Notes: "зависала сторінка Registering... на хвилину". Тепер зависання немає — відповідь швидка, але UX ще гірший: замість повідомлення "Email already registered" — повний blank screen.
- Console: немає нових помилок (409 тихо ковтається на рівні thunk).

**Root cause (перевірено в коді):**
- `apps/client/src/store/session.ts:174` — `register.rejected` → `state.status = 'error'`
- `apps/client/src/App.tsx:149` — `status === 'error'` → `<BootstrapLoader networkError={true} />`
- `status='error'` це спільний стан для "server unreachable" (bootstrap) і "register failed" (4xx). Неправильне об'єднання.

**🐛 BUG R2-REG-001** — новий, середній пріоритет.

#### 2.2.5 Довгі значення (Wave 1.1 gap check)

**Назва 200+ символів:**
- Name = 200×"A" + "a", Email = "qa.r2.b2.timestamp@test.local", Password = "testpass123" → Submit.
- `POST /api/auth/register → 500 Internal Server Error`.
- Console: `[apiFetch] server 5xx detail: Internal server error`
- BootstrapLoader + "Server error. Please try again later." toast.
- **Висновок: сервер CRASHE на довгій назві.** No Zod schema, Prisma throws on oversized string.

**Email 100+ символів:**
- Name = "R2B2 LongEmailTester", Email = 98×"a" + "@test.local" (110 chars), Password = "testpass123" → Submit.
- `POST /api/auth/register → 201 Created`. Redirect to My Rooms. **Accepted!**
- Сервер приймає email з 110+ символами — немає max length validation.

**Пароль 200+ символів:**
- Name = "R2B2 LongPass Tester", Email = "qa.r2.b2.longpass@test.local", Password = 200×"A" + "1" → Submit.
- `POST /api/auth/register → 201 Created`. Redirect to My Rooms. Welcome toast з'явився. **Accepted!**
- Сервер приймає пароль 200+ символів — немає max length validation.

**Висновок по Wave 1.1 gap:**
- Назва: сервер **500** (Prisma crash) на 200+ chars — підтверджує відсутність Zod schema.
- Email: сервер **201** (приймає) без обмеження довжини — gap.
- Пароль: сервер **201** (приймає) без обмеження довжини — gap (bcrypt з дуже довгим паролем може бути DoS вектор).
- `apps/server/src/routes/auth.ts` — жодного Zod validation middleware для `/register`.

**🔴 CRITICAL R2-REG-002** — відсутній Zod schema для /api/auth/register.

#### 2.2.6 Спецсимволи / XSS

- Name = "🎲<script>alert(1)</script>", Email = unique timestamp email, Password = "testpass123" → Submit.
- `POST /api/auth/register → 201 Created`.
- Redirect to My Rooms. User sidebar chip відображає "🎲 <script>alert..." як **plain text**.
- Alert dialog **не з'явився** — XSS не виконався. React JSX escaping захистив рендеринг.
- ✅ XSS захист через React DOM escaping — **працює**.
- ⚠️ Але сам name з HTML тегами зберігається в БД — питання sanitization на server-side. При вивіданні через raw API або іншому контексті де НЕ React escaping — може бути небезпечно.

### 2.3 Позитивний сценарій

- Унікальний email: `qa.r2.b2.1777771494954@test.local` (через Date.now() timestamp).
- Name = "R2B2 Tester", Email = unique, Password = "testpass123" → Submit.
- `POST /api/auth/register → 201 Created`.
- **Куди перекинуло:** My Rooms dashboard (лівий sidebar "My rooms" active).
- **URL:** http://localhost:5173/ (незмінна — SPA).
- **Welcome toast (MIN-005):** з'явився у bottom-right — "Welcome, R2B2 Tester! Glad to have you here." ✅
  - Тривалість: ~2-3 секунди (потім auto-dismiss).
  - Є × кнопка для ручного закриття.
- **Auto-login:** одразу залогінений — sidebar показує "R2B2 Tester" + avatar.
- **Console:** чиста — жодного error/warning.
- **Network:** `POST /api/auth/register 201`, `GET /api/rooms 200` — без помилок.

### 2.4 F5 race (2 варіанти протестовано)

**Варіант A: F5 одразу після submit (під час реєстрації):**
- Name/Email/Password заповнено → Submit → одразу F5.
- На localhost реєстрація настільки швидка що race window мінімальне.
- Результат: повернення на Landing page (не My Rooms). Немає stuck state, немає помилок.
- Якщо реєстрація встигла завершитись до F5 — повернення на landing (tokens були, але page reload їх ще не завантажив).
- **Прийнятна поведінка** — немає критичних проблем.

**Варіант B: F5 після успішної реєстрації (вже на My Rooms):**
- Користувач на My Rooms → F5.
- Результат: My Rooms завантажується знову, user залишається залогіненим.
- Але: "Server error. Please try again later." toast з'являється.
- Network: `POST /api/auth/refresh → 500` (перший запит), потім `POST /api/auth/refresh → 200` (другий).
- Console: `[apiFetch] server 5xx detail: Internal server error`.
- Сервер інтерміттентно повертає 500 на refresh endpoint.
- **⚠️ MINOR:** інтерміттентний 500 на /refresh при F5 з'являється і showує toast "Server error" але user залишається авторизованим.

---

### Verifying R1 fixes

| Bug | Was | Now | Verdict |
|-----|-----|-----|---------|
| MIN-005 Welcome toast | нема feedback після реєстрації | "Welcome, R2B2 Tester! Glad to have you here." — toast у bottom-right, ~2-3 сек, auto-dismiss, × кнопка | ✅ Реалізовано |

---

### Нові спостереження

**🐛 R2-REG-001 — 409 "Email exists" → BootstrapLoader (blank screen) замість inline error**
- Severity: Medium-High (блокує UX реєстрації при duplicate email)
- Reproducibility: 100%
- Root cause: `session.ts` register.rejected → status='error'; App.tsx status==='error' → BootstrapLoader
- Файли: `apps/client/src/store/session.ts:174`, `apps/client/src/App.tsx:149`

**🔴 R2-REG-002 — Відсутній Zod schema на POST /api/auth/register (Wave 1.1 gap)**
- Severity: Critical (server crash 500 на name>200chars, DoS на password>200chars)
- Name 200+ chars → 500 server crash (Prisma throws)
- Email 100+ chars → 201 accepted (no max length)
- Password 200+ chars → 201 accepted (DoS via bcrypt with huge input)
- Root cause: `apps/server/src/routes/auth.ts` — жодного validateBody middleware
- Файли: `apps/server/src/routes/auth.ts`

**⚠️ R2-REG-003 — Відсутні React-level inline помилки для empty fields**
- Severity: Minor (UX polish)
- Empty submit → тільки browser native tooltip (мова = мова браузера, а не UI)
- React validate() не запускається на empty fields — лише password length перевіряється React-рівнем
- Файли: `apps/client/src/pages/Auth/Register.tsx:30-35` (validate function пропускає empty check?)
- Насправді browser required attribute блокує form submit до validate() — тому React validate() не бачить empty.

**⚠️ R2-REG-004 — Інтерміттентний 500 на /api/auth/refresh при F5**
- Severity: Minor (intermittent, user залишається logged in)
- Reproducibility: спостерігалось 1 раз під час тесту
- Toast "Server error. Please try again later." з'являється хоча user залишається авторизованим
- Файли: server-side auth/refresh route

**⚠️ R2-REG-005 — Відсутнє Password confirmation поле**
- Severity: Minor-UX (Round 1 Notes: "2.3.4 — немає")
- Стандартна UX-практика — підтверджувати пароль при реєстрації. Відсутність підвищує ймовірність typo в паролі.
- Файли: `apps/client/src/pages/Auth/Register.tsx`

**⚠️ R2-REG-006 — Немає посилання "Back to landing" або breadcrumb на register form**
- Severity: Minor-UX (user trap)
- Форма рендериться inline на `localhost:5173/`. Немає очевидного способу повернутися на landing крім browser Back.

---

### Скріни

Скріни зроблені через `computer screenshot save_to_disk=true` — внутрішні MCP IDs (файли зберігаються в тимчасовому сховищі MCP процесу):

- `ss_8237nq07s` → `block02_01_register_form.png` — порожня форма реєстрації
- `ss_6712hqw49` / `ss_40644o8sr` → `block02_02_validation_errors.png` — password <8 chars error
- `ss_1351wytqq` → `block02_99_409_bootstrap_bug.png` — 409 → BootstrapLoader (R2-REG-001)
- `ss_3895a2e6p` → `block02_99_longname_500.png` — long name → 500 → BootstrapLoader (R2-REG-002)
- `ss_9941q6vtj` → `block02_03_welcome_toast.png` — welcome toast після реєстрації (MIN-005 ✅)
- `ss_03572ohbw` → `block02_04_dashboard_after_register.png` — My Rooms після реєстрації

---

## Human observations

Лев погодився з результатами агента без власного проходу. Знахідки та класифікація прийняті. Block 2 пройдено агентом самостійно.

---

## Agreement / Disagreement

| Пункт | Verdict |
|-------|---------|
| MIN-005 Welcome toast | ✅ Підтверджено — закрито |
| R2-BUG-004 (409 → BootstrapLoader) | ✅ Прийнято — регресія Wave 3.2 |
| R2-REG-002 (no zod на /auth/register) | ✅ Прийнято — Wave 1.1 gap |
| R2-MIN-001 (browser-native validation) | ✅ Прийнято |
| R2-MIN-002 (intermittent 500 на /refresh при F5) | ✅ Прийнято — потребує root cause investigation у наступних блоках (можливо пов'язаний з BUG-007 territory) |
| R2-MIN-003 (нема password confirmation) | ✅ Прийнято |
| R2-MIN-004 (нема Back to landing) | ✅ Прийнято |

**Висновок Block 2:** агент впорався самостійно. Block 3 — без human-pre-pass, тільки якщо агент знайде щось спірне або критичне.

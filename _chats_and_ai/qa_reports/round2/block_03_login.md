# Block 3 — Логін (Round 2 verification)

**Дата:** 2026-05-03  
**URL:** http://localhost:5173  
**Тестувальник:** qa-explorer agent  
**Тестовий акаунт:** `qa.r2.b3.1777774791964@test.local` / `testpass123`

---

## Agent observations

### Підготовка

- Зареєстрований свіжий акаунт `R2B3 Tester` через форму реєстрації.
- Welcome toast з'явився: "Welcome, R2B3 Tester! Glad to have you here." ✅
- Logout через user menu (sidebar bottom-left) → токени очищені з localStorage.
- localStorage після logout: тільки `i18nextLng` залишилось ✅

### 3.1 Форма логіну — вигляд

- **Заголовок:** "Sign in to session"
- **Підзаголовок:** "Authenticate or create a new account"
- **Поля:** Email (type=email) + Password (type=password) — **2 поля**, без Name
- **Кнопка submit:** "Sign In" (золота, fullWidth, primary)
- **Tabs:** Login (активний, bold) | Register
- **"Забув пароль?"** — відсутній (прийнятно для MVP)
- **Посилання на реєстрацію** — через таб "Register" (не окреме посилання)
- **"Back to landing"** — відсутнє (тільки Browser Back)
- **"Join as Observer"** — присутній як кнопка внизу форми ✅
- **ThemeToggle / LanguageSwitcher** — присутні в top-right (GB|UA, Light|Dark|System) ✅
  - На auth-screen вони працюють (на відміну від Landing — R2-BUG-002)

### 3.2 Негативні сценарії

#### 3.2.1 Невірний пароль

- Email: `qa.r2.b3.1777774791964@test.local`, Password: `WRONGPASSWORD999` → Submit.
- `POST /api/auth/login → 401 Unauthorized` (network log)
- **UI:** замість inline error "Unauthorized" в формі — застосунок переходить у **BootstrapLoader** (blank screen + spinner + "Try again")
- Перший рендер BootstrapLoader без тексту, після затримки: "Server is waking up, hold on..."
- `login.rejected` → `state.status = 'error'` → App.tsx рядок 149: `status === 'error'` → `<BootstrapLoader networkError={true}>`
- **РЕГРЕСІЯ:** в R1 форма показувала "Unauthorized" під полем (inline). Зараз — blank screen.
- Для відновлення форми: натиснути "Try again" (1-2 рази). Перше натискання може показати "bootstrapping" стан, друге відновлює форму.

**🔴 R2-BUG-005 — [НОВИЙ] login 401 → BootstrapLoader (regression with R2-BUG-004)**

#### 3.2.2 Неіснуючий email

- Email: `nobody@nonexistent-domain-xyz.local`, Password: `somepassword123` → Submit.
- `POST /api/auth/login → 401`
- **UI:** той самий BootstrapLoader — "Connecting to server..." (інша i18n фраза того самого компонента)
- Root cause: ідентичний 3.2.1.

#### 3.2.3 Порожні поля → Submit

- Клік "Sign In" з порожніми полями.
- Жодного network запиту (browser `required` блокує submit) ✅
- Email field підсвічується золотою рамкою.
- **Немає React-level inline error text** — тільки border highlight.
- ⚠️ Непослідовна UX: для validate(email/password) є React inline error; для empty fields — тільки browser native behavior (та ж проблема що R2-MIN-001 на register).

#### 3.2.4 Довгі credentials (Wave 1.1 gap для login)

**Email 200+ chars (валідний формат):**
- `aaa...a@test.local` (200+ chars) → Submit
- `POST /api/auth/login → 401` (не 500!) — сервер робить `WHERE email = ?` і повертає "not found" → 401.
- **Висновок: server НЕ crashe на довгому email при login** — бо write до БД не відбувається.
- BootstrapLoader з'являється (через 401 → R2-BUG-005).

**Password 200+ chars + правильний email:**
- `qa.r2.b3...@test.local` + 200-char password → Submit
- `POST /api/auth/login → 401` — bcrypt.compare() запускається, але повертає false (пароль не той) → 401.
- **Висновок:** server НЕ crashe. Але якщо email + пароль правильні (тобто user знає email але хоче DoS), bcrypt.compare() з 200-char input ПОВІЛЬНИЙ (bcrypt truncates at 72 bytes — але compare input length не захищений на login рівні).
- ⚠️ MINOR: DoS вектор для login з правильним email + дуже довгим паролем — bcrypt буде повільним. Менший ризик ніж на register (де hash виконується), але все одно.

**Wave 1.1 gap висновок для login:**
- Email довгий → 401 (OK, no crash) ✅
- Password довгий → 401 (OK, no crash), але bcrypt compare ризик ⚠️
- Login не crashe на 500 на відміну від register — бо відсутність write означає відсутність Prisma truncation error.

### 3.3 Позитивний сценарій

- Credentials: `qa.r2.b3.1777774791964@test.local` / `testpass123` → Submit.
- `POST /api/auth/login → 200 Created`
- **Redirect:** My Rooms dashboard (R2B3 Tester в sidebar) ✅
- **Welcome toast:** відсутній ✅ (тільки після register, не після login — правильно)
- **Console:** без помилок ✅
- **Час:** миттєво на localhost (<300ms)

### 3.4 Persistence — сесія + F5 race

#### 3.4.1 Базовий F5

- Залогінений → F5 (один раз).
- BootstrapLoader spinner → **R2-MIN-002 СПРАЦЬОВУЄ:** `POST /api/auth/refresh → 500`, потім → 200.
- "Server error. Please try again later." toast з'являється.
- BootstrapLoader лишається (status='error').
- Натискання "Try again" → наступний /api/auth/refresh → 200 → My Rooms відновлюється.
- **Висновок:** базовий F5 відновлює сесію, але вимагає ручного "Try again" через intermittent 500 на /refresh.

#### 3.4.2 F5 race (BUG-007 verification) — ✅ ВИПРАВЛЕНО

- Залогінений → `window.location.reload()` → одразу F5 (два перевантаження поспіль).
- Після обох перевантажень: My Rooms завантажено, user залишається залогіненим.
- Жодного logout-redirect! Wave 3.1 AbortError→'bootstrapping'→retry працює ✅
- **BUG-007 підтверджено виправленим.**
- Network: AbortError на першому reload не призводить до idle стану.

#### 3.4.3 Закриття вкладки + повернення

- Вкладку закрито → нова вкладка відкрита з `http://localhost:5173/`.
- Bootstrap spinner (~1 сек) → My Rooms завантажено, R2B3 Tester авторизований ✅
- Цього разу без R2-MIN-002 500 (intermittent — не кожен раз).
- **Сесія персистить між вкладками ✅**

#### 3.4.4 R2-MIN-002 deep dive

**На login flow:**
- Перший F5 після login → `/api/auth/refresh → 500` intermittent.
- Network log за всю сесію: 4× 500, 4× 200 на refresh (50% fail rate!).
- Toast "Server error. Please try again later." кожен раз при 500.
- Після BootstrapLoader "Try again" → наступний /api/auth/refresh → 200.

**Root cause гіпотеза (уточнена після аналізу коду):**
- `AuthService.rotateRefresh()` виконує: bcrypt.compare → DELETE old session → bcrypt.hash → INSERT new session.
- При одночасних F5 (або від апіfetch retry logic) два запити з одним токеном можуть гонятися:
  - Запит 1: знайшов сесію, починає rotate (DELETE → INSERT)
  - Запит 2: та сама сесія вже видалена → `session not found` → `deleteAllByUserId` → HttpError 401 (не 500!)
- Але ми бачимо 500 (не 401). Тому причина інша.
- Можлива причина: Prisma connection pool exhaustion або транзакційний conflict під час DELETE+INSERT — Prisma throws unhandled error → Express handleError() → 500.
- `apiFetch.doRefresh()` при 500: `!res.ok` → `tokenStore.clear()` → returns null → ... але `bootstrapSession` використовує окремий fetch (не apiFetch), тому tokenStore.clear() не відбувається при 500 у bootstrap flow.
- Конкретний Prisma error потребує перевірки логів сервера.

**Висновок R2-MIN-002:** підтверджено на login flow. Не пов'язаний з BUG-007 (F5 race/AbortError). Окремий root cause — intermittent 500 на /api/auth/refresh ймовірно через Prisma session rotation race.

### 3.5 Logout

- **Розташування кнопки:** sidebar bottom-left → клік на avatar/username → розкривається панель: Theme (Light|Dark|System), Language (GB|UA), **Logout**.
- **Redirect після logout:** Landing page ✅ (в новій вкладці коректно; в першій сесії — Register form — різниця через SPA state).
- **Токени після logout:** localStorage чистий (тільки `i18nextLng`) ✅
- **Browser Back після logout:** залишається на Landing page, не повертається до My Rooms ✅ (SPA single URL behavior — security ✅)

**⚠️ НОВИЙ БАГ — Logout → 503:**
- `POST /api/auth/logout → 503 Service Unavailable` (обидва рази в сесії!)
- 503 = Vite dev proxy не дістав відповідь від Express backend (server down або race).
- `tokenStore.clear()` виконується в `finally` блоці → tokens cleared ✅
- Але `logout.fulfilled` НЕ вистрілює при throw (thunk rejected) → Redux `status` залишається 'authenticated' на момент виходу.
- Але `tokenStore.getRefresh()` → null → на наступному bootstrap → `status = 'idle'` → Landing.
- **Практичний наслідок:** сесія в DB НЕ видаляється при logout. Refresh token в БД лишається valid (до expiry).
- **Severity:** Medium-High (server-side session not invalidated on logout — security gap).

---

### Verifying R1 fixes

| Bug | Was | Now | Verdict |
|-----|-----|-----|---------|
| BUG-007 F5 race | F5 під час bootstrap → logout | AbortError → retry → session restored | ✅ ВИПРАВЛЕНО |
| BUG-006 Theme split | Theme split login/background | N/A (auth screen — перевірено theme togglers присутні) | ✅ OK |
| Wave 5.3 i18n guard | i18n key витікав як текст | Код присутній в Login.tsx:49, але masked R2-BUG-005 | ❓ Неможливо верифікувати — маскується BootstrapLoader regression |

---

### Нові спостереження

**🔴 R2-BUG-005 — login 401/4xx → BootstrapLoader (regression with R2-BUG-004)**
- Severity: High (блокує весь login error UX — кожна невдала спроба входу → blank screen)
- Reproducibility: 100%
- Root cause: `session.ts:163-165` — `login.rejected` → `state.status = 'error'`; `App.tsx:149` — `status === 'error'` → BootstrapLoader
- Той самий root cause що R2-BUG-004 (register 409/500 → BootstrapLoader)
- Фікс: в `session.ts` — додати окремий field `authError` для form-level errors; в `App.tsx` — BootstrapLoader тільки при `status === 'error' && source === 'bootstrap'`, не при `source === 'auth'`
- Файли: `apps/client/src/store/session.ts`, `apps/client/src/App.tsx`

**🔴 R2-BUG-006 — Logout → 503 (server-side session not invalidated)**
- Severity: Medium-High (security: refresh token linger in DB after logout)
- Reproducibility: 100% (в dev environment) — можливо dev-specific, потребує перевірки на production
- `POST /api/auth/logout → 503 Service Unavailable` — Vite proxy не може достукатись до Express
- tokenStore.clear() в client `finally` → client-side OK, але server session not deleted
- Фікс: 1) Перевірити чому Express auth/logout не відповідає (jwtAuth race? access token expired?). 2) logout thunk — при fail все одно dispatch clearSession() для Redux state.
- Файли: `apps/server/src/routes/auth.ts`, `apps/client/src/store/session.ts`

**⚠️ R2-MIN-005 — "Try again" потрібен 1-2 рази для відновлення після BootstrapLoader**
- Severity: Minor-UX
- Перший клік "Try again" → 'bootstrapping' (thunk pending), якщо 500 ще раз → залишається на loader
- Другий клік "Try again" → зазвичай 200 → відновлює
- Непередбачувана кількість кліків для відновлення
- Фікс: BootstrapLoader має auto-retry після 2-3 сек замість manual "Try again"

**⚠️ R2-MIN-006 — Logout redirect inconsistency (Register form vs Landing)**
- Severity: Minor-UX
- Перший logout (після register+logout): → Register form (не Landing)
- Другий logout (нова вкладка): → Landing page
- Різниця: в першому сесії `authView` state залишився 'register' після register → logout лишив на тому ж SPA state.
- Фікс: `logout.fulfilled` reducer повинен скидати authView до 'landing'.
- Файли: `apps/client/src/App.tsx` — при logout dispatch → setAuthView('landing')

**⚠️ R2-MIN-007 — Немає "Back to landing" посилання на login form**
- Severity: Minor-UX (same as R2-MIN-004 on register)
- На login form немає явного посилання/кнопки "← Back" до Landing
- Тільки browser Back або пряма навігація

**✅ OK — login form togglers**
- ThemeToggle і LanguageSwitcher на login/auth screen: присутні, клікабельні (на відміну від Landing R2-BUG-002)

---

### Wave 5.3 verification note

Код Wave 5.3 (i18n regex-guard) присутній в `Login.tsx:49`:
```ts
const displayError = rawError
  ? /^[\w]+:[\w.]+$/.test(rawError) ? t(rawError as never, rawError) : rawError
  : null;
```
Але через R2-BUG-005 (login 401 → BootstrapLoader → Login компонент unmounts) — цей код **ніколи не досягається** при login errors. Верифікація Wave 5.3 на login неможлива без фіксу R2-BUG-005.

---

### Скріни

Знято через `computer screenshot save_to_disk=true` — MCP внутрішні IDs:

| MCP ID | Опис |
|--------|------|
| `ss_6405l47id` | `block03_01_login_form.png` — форма логіну |
| `ss_3782w1kw1` | `block03_02_invalid_password_bootstraploader.png` — 401 → BootstrapLoader (R2-BUG-005) |
| `ss_5662ckiup` | `block03_03_f5_server_error_toast.png` — F5 → 500 refresh + "Server error" toast (R2-MIN-002) |
| `ss_4144f09p4` | `block03_04_dashboard_after_login.png` — My Rooms після успішного логіну |
| `ss_0947jyuuj` | `block03_05_f5_race_recovered.png` — після double-F5, session збережена (BUG-007 ✅) |

---

## Human observations

_Буде заповнено Левом після review._

---

## Agreement / Disagreement

| Пункт | Verdict |
|-------|---------|
| BUG-007 F5 race | ✅ Підтверджено виправленим |
| R2-BUG-005 (login 401 → BootstrapLoader) | Потребує підтвердження Лева |
| R2-BUG-006 (logout 503) | Потребує перевірки на production |
| R2-MIN-002 на login flow | ✅ Підтверджено — той самий intermittent 500 pattern |
| Wave 5.3 i18n guard | ❓ Не верифіковано — masked by R2-BUG-005 |

# 🐛 Bug Reports — VTT Platform

**Створено:** 2026-05-03  
**Джерело:** `qa_report_2026-05-02_RAW_NOTES.md` (нотатки Лева, блоки 1–7)  
**Тестувальник:** Лев Семиволос  
**Класифікатор:** Claude (Opus 4.7)  
**Статус:** Тестування призупинено на Блоці 7 — invite flow повністю зламаний.

---

## 📊 Сводка

| Severity      | Кількість | Опис                                       |
| ------------- | --------- | ------------------------------------------ |
| 🔴 CRITICAL   | **5**     | Блокери: invite, безпека, валідація сервера |
| 🐛 BUG        | **7**     | Видимі дефекти, не блокують тест           |
| ⚠️ MINOR      | **8**     | UX-зауваження, polish, technical debt      |
| ✅ OK         | 18        | Працює як очікується                       |

**Тотал знайдено:** 21 проблема за 7 блоків (≈ 3 проблеми на блок).

---

## 🔴 CRITICAL — БЛОКЕРИ

> Без цих фіксів продовжувати тестування блоків 8+ сенсу немає.

---

### BUG-001 🔴 — Invite flow для Player повністю зламаний

**Блок репорту:** 7.4  
**Severity:** Critical (блокує всю мультиплеєрну частину тестування)  
**Reproducibility:** 100%

**Що очікується (нормальний flow):**
1. GM створює invite link → копіює.
2. Player у другому браузері відкриває URL `https://.../?invite=TOKEN`.
3. Якщо Player не залогінений — після успішного логіну/реєстрації автоматично приєднується до кімнати з роллю Player.
4. У GM-вікні Player з'являється у списку Members в Lobby.

**Що відбувається фактично:**
1. Гість Player відкриває `/?invite=TOKEN`.
2. Залогінюється або реєструється — потрапляє у Lobby тієї кімнати.
3. **АЛЕ**: у GM-вікні список Members залишається без змін — Player не доданий.
4. Якщо Player натискає Back → редірект на `/My rooms`, кімната не з'являється там як "запрошена".
5. Повторне відкриття `/?invite=TOKEN` другий раз не містить `?invite` після успішного фону → переносить у Lobby, але знову без приєднання.
6. F5 у Lobby — викидає на My rooms (бо membership не зафіксовано в БД).

**Root cause (з коду):**

`apps/client/src/App.tsx:70–84` містить:
```ts
.then((room) => {
  dispatch(setCurrentRoom(room));
  window.history.replaceState({}, '', window.location.pathname);
})
.catch(() => {});  // ← тихо ковтає помилку
```

Відповідь сервера на `POST /api/rooms/join` повертається з room object, який НЕ має поточного user у `members`. Або:
- `roomService.joinByInvite(token)` валідує токен але **не додає** user до RoomMember.
- Або повертає room до того, як membership записано.

Команда для перевірки на сервері: дивитись `apps/server/src/services/roomService.joinByInvite()` — чи реально пише членство.

**Console errors:**
```
POST https://vtt-platform-client.vercel.app/api/rooms/join 404 (Not Found)
```
(спостерігалось коли invite token не валідний для /join — але /join сама spec валідна)

**Impact:**
- ⛔ Неможливо запросити Player → неможливо протестувати все що потребує 2+ учасників: чат, токени синхронізація, fog of war, video, initiative tracker, handouts, …
- Це блокує Блоки 8–22 практично повністю.

**Запропонований фікс:**
1. Перевірити `roomService.joinByInvite()` — чи додає user в RoomMember.
2. Прибрати `.catch(() => {})` з App.tsx — кидати toast з помилкою.
3. Додати loading state у Lobby до моменту коли membership гарантовано є.
4. Якщо invite спрацював — `?invite` НЕ повинен очищатись з URL до підтвердження join (інакше повторне F5 ламає flow).

---

### BUG-002 🔴 — Invite flow для Observer не приймає `?invite=TOKEN` URL

**Блок репорту:** 7.5  
**Severity:** Critical  
**Reproducibility:** 100%

**Що очікується:**
- Observer відкриває `/?invite=TOKEN` (без логіну) → одразу потрапляє у Lobby як Observer (per Bible §3, Ф1: "вхід за посиланням без реєстрації").

**Що відбувається фактично:**
1. Observer (не залогінений) відкриває `/?invite=TOKEN`.
2. Редірект на форму логіну — **invite token губиться**.
3. Observer натискає "Join as Observer" → відкривається форма з полями `Invite Code` + `Your Name`.
4. **АЛЕ**: користувач не має звідки взяти Invite Code — лінк надав GM, а не код.
5. Workaround: вручну вирізати `TOKEN` з URL і вставити в поле Invite Code.

**Console errors:**
```
POST /api/rooms/join-invite 400 (Bad Request)  ← двічі
POST /api/rooms/join 404 (Not Found)
```

**Root cause:**

`App.tsx:70–84` має guard `if (status !== 'authenticated' || currentRoom) return;` — для неавторизованого Observer цей useEffect не спрацьовує, отже invite token не використовується.

Логіка для Observer flow повинна бути окремою:
- Якщо `?invite=TOKEN` присутній і користувач НЕ залогінений → редірект на `ObserverEntry` з заповненим `inviteCode` через state/URL.
- Або кнопка "Join as Observer" повинна бути на сторінці запрошення з контекстом.

**Impact:**
- Observer flow — одна з ключових фіч за вимогою Ф1, заявлена у Bible §3 (актор Observer).
- Зараз ця фіча юзабельна тільки для технічних користувачів які знають як вирізати токен.

**Запропонований фікс:**
1. У App.tsx: якщо `?invite=` присутній і `status !== 'authenticated'` → встановити `authView = 'observer'` і pre-populate inviteCode зі state.
2. ObserverEntry прийняти inviteCode як prop або з URL.
3. Окрема CTA у форму логіну: "Зайти як спостерігач" з вже заповненим кодом.

---

### BUG-003 🔴 — Observer-акаунт має права повноцінного користувача (БЕЗПЕКОВА ДІРКА)

**Блок репорту:** 7.5 (примітка "КРИТИЧНО")  
**Severity:** Critical (security)  
**Reproducibility:** 100%

**Що очікується (per Bible §3 та §2.18 Security View RBAC):**
- Observer — read-only актор з обмеженим доступом тільки до однієї кімнати, до якої запрошений.
- Observer **не повинен** мати можливість створювати кімнати, виходити з контексту тієї однієї кімнати, бачити список My Rooms.

**Що відбувається фактично:**
1. Observer заходить через workaround з BUG-002.
2. У Lobby observer натискає Back або F5.
3. **Редірект на My rooms** — повноцінний Dashboard.
4. У сесії користувач `observer-f9f667c5eb31ef2e@anon.local` (анонімний email).
5. **Цей акаунт може створювати власні кімнати** — кнопка Create Room активна, кімнати створюються.
6. Після F5 акаунт зберігається — Observer токен живе як звичайна сесія.

**Root cause (з коду):**

`apps/server/src/routes/rooms.ts:121–157` створює юзера через `userRepo.create()` з `passwordHash = ''` і викликає `authService.issueObserverTokens(userPublic, ua)`.

Питання до перевірки:
- Чи `issueObserverTokens()` ставить distinct role/scope в JWT payload, відмінне від звичайного user?
- Чи middleware `jwtAuth` далі перевіряє цю роль для ендпоінтів типу `POST /rooms` (create room)?

З симптомів видно: **JWT не обмежує scope** — observer-token проходить як звичайний access token для будь-якого ендпоінта.

**Impact:**
- Анонімний користувач без реєстрації може флудити БД новими кімнатами.
- Observer бачить My Rooms — порушення data isolation.
- Bible §2.18 RBAC проекція: порушення вимоги.

**Запропонований фікс:**
1. У `authService.issueObserverTokens()`: додати в JWT payload `role: 'observer'` + `roomId: <bound room>`.
2. Створити middleware `requireUserRole(['gm', 'player'])` для ендпоінтів типу POST /rooms, GET /rooms (my rooms list).
3. Front-end: якщо JWT.role === 'observer' — НЕ показувати Dashboard, а тримати у GameRoom тієї однієї кімнати; Logout = знищення анонім токена.
4. (Опційно) очищати анонімні users з БД через 24 год після відсутності активності.

---

### BUG-004 🔴 — 500 Internal Server Error при довгих іменах кімнат (немає валідації)

**Блок репорту:** 5.2  
**Severity:** Critical (server crash через user input)  
**Reproducibility:** 100%

**Що очікується:**
- Клієнт обмежує довжину `name` та `system` (наприклад 100 і 50 символів).
- Сервер відхиляє з 400 Bad Request з зрозумілим повідомленням якщо ліміт перевищено.

**Що відбувається фактично:**
- Поле `Name` і `Game system` без `maxlength`.
- Юзер вводить довгий рядок (200+ символів) → submit.
- Сервер відповідає **500 Internal Server Error** (швидше за все Prisma або PostgreSQL відкидає через VARCHAR(100) ліміт колонки).
- На UI показується toast `"Помилка сервера. Спробуйте пізніше."` + текстова прив'язка до ключа `errors:server.generic` (див. також BUG-011).

**Console errors:**
```
POST https://vtt-platform-client.vercel.app/api/rooms 500 (Internal Server Error)
[apiFetch] server 5xx detail: Internal server error
```

**Root cause:**

`apps/server/src/routes/rooms.ts` POST `/` — судячи з симптомів, не має zod-валідації або має, але обмеження не співпадають з БД-схемою. PostgreSQL VARCHAR(N) повертає DB-помилку → handleError() ковтає у 500.

**Impact:**
- 500 на user input — погана сигналізація.
- Будь-який пейлоад трохи більше очікуваного → server error замість 400.
- Це поверхневий симптом загальнішої проблеми: **немає вхідної валідації input length на жодному endpoint** (ймовірно повторюється на characters/notes/handouts/chat).

**Запропонований фікс:**
1. Створити `roomCreateSchema` через zod: `name: z.string().trim().min(1).max(100)`, `system: z.string().trim().max(50)`.
2. Застосувати middleware `validate(roomCreateSchema)` до POST `/api/rooms`.
3. На клієнті додати `<input maxLength={100}>` + counter "32/100".
4. Аналогічну ревізію зробити для:
    - `POST /scenes` (name, описи)
    - `POST /tokens` (name)
    - `POST /characters` (всі поля)
    - `POST /notes`
    - `POST /handouts`
    - `POST /chat/message` (content length)

---

### BUG-005 🔴 — 401 Unauthorized при першому invite link generation (race condition)

**Блок репорту:** 7.3  
**Severity:** High → Critical (з'являється тільки перший раз для нового user, але стопорить новачків)  
**Reproducibility:** 100% при першому вході нового користувача

**Що очікується:**
- GM відкриває Lobby → клік Invite → invite link миттєво.

**Що відбувається фактично:**
1. GM вперше відкриває Lobby після логіну.
2. Першим запитом `POST /api/rooms/:id/invites` повертається **401 Unauthorized**.
3. Через паузу (кілька секунд) кнопка Copy з'являється з валідним посиланням.
4. На наступних входах помилки немає.

**Console errors:**
```
POST /api/rooms/{room-id}/invites 401 (Unauthorized)
```

**Root cause:**

Race condition між:
- `bootstrapSession()` (App.tsx:65) — завантажує сесію, ставить токен у axios/fetch defaults.
- `useEffect` у Lobby компоненті — фірить запит `/invites` до того як bootstrap завершився.

Або: refresh token rotation робиться під час першого запиту і інвалідує заголовок.

**Impact:**
- Новий користувач може подумати що сайт зламаний.
- Логічна помилка в стейт-машині сесії.

**Запропонований фікс:**
1. У RoomLobby: не фірити `fetchInvites()` до моменту коли `session.status === 'authenticated' && !session.refreshing`.
2. На клієнті в apiFetch: автоматичний retry з оновленим токеном при 401 (один раз).
3. У store/session: блокувати fetch-и поки `bootstrapping`/`refreshing`.

---

## 🐛 BUG — Видимі дефекти

---

### BUG-006 🐛 — Theme не персистить на сторінці login (split light/dark)

**Блок репорту:** 1.3  
**Severity:** Medium

**Repro:**
1. Зареєстрований користувач вибирає темну тему на Dashboard.
2. F5.
3. Bootstrap фейлиться (наприклад refresh token expired) → редірект на login.
4. **Spectacle:** форма логіну рендериться у світлій темі, фон сторінки — у темній. VTT-логотип у хедері невидимий (білий на білому).

**Root cause:**
- `useTheme()` хук у App.tsx читає тему з localStorage і ставить CSS-змінну на `<html>`.
- Auth-screen компоненти мають свої CSS-модулі що ігнорують CSS-змінні (hardcoded colors).
- VTT-логотип у хедері — fixed колір що не переключається.

**Запропонований фікс:**
- Усі auth компоненти переписати на CSS-змінні з design tokens.
- Логотип SVG — використовувати `currentColor` або CSS-змінну `--brand-fg`.

---

### BUG-007 🐛 — F5 race: переривання bootstrap fetch виганяє на login

**Блок репорту:** 3.4  
**Severity:** Medium

**Repro:**
1. Користувач залогінений.
2. F5 → бачить порожній екран ~2-3 секунди (bootstrap session).
3. Натискає F5 ще раз під час цього очікування.
4. **Spectacle:** перекидає на форму логіну.

**Root cause:**
- При F5 переривається запит `GET /api/auth/me` (або bootstrap call).
- Промазана/перервана відповідь обробляється як "session not found" → redux ставить `unauthenticated`.

**Запропонований фікс:**
- У store/session.bootstrapSession: розрізняти "abort" від "401". На abort — повторити, не очищати токен.
- Додати loading індикатор замість порожнього синього екрану (див. також MIN-001).

---

### BUG-008 🐛 — Settings (soon) виглядає клікабельним пунктом

**Блок репорту:** 4.2  
**Severity:** Low-Medium

**Repro:**
- Sidebar Dashboard → пункт "Налаштування (soon)" виглядає так само як "Мої кімнати", але не реагує на клік.

**Запропонований фікс:**
- Додати `disabled` стиль (opacity 0.5, cursor: not-allowed).
- АБО видалити пункт до моменту реалізації.
- АБО показати tooltip "Coming soon" при hover.

---

### BUG-009 🐛 — Кнопка "Create Room" має 2 plus-icons

**Блок репорту:** 4.2  
**Severity:** Low (visual bug)

**Repro:**
- Dashboard → CreateRoomCard → видно дві іконки `+` різного розміру в одному компоненті.

**Root cause:**
Швидше за все у `apps/client/src/components/Dashboard/CreateRoomCard.tsx` є й SVG `<Plus>`, і Unicode `+`, або два різних `<Plus>` з різних місць.

**Запропонований фікс:**
- Залишити одну іконку.

---

### BUG-010 🐛 — i18n key `errors:server.generic` витікає на UI

**Блок репорту:** 5.2  
**Severity:** Medium

**Repro:**
- Створити кімнату з довгою назвою → tost з повідомленням, але також на екрані "errors:server.generic" як текст.

**Root cause:**
- Десь у коді: `t('errors:server.generic')` викликається до того як namespace завантажений, або `i18n.t()` на ключ якого нема в JSON.

**Запропонований фікс:**
- Перевірити `apps/client/src/locales/{uk,en}/errors.json` на наявність ключа `server.generic`.
- Перевірити namespaces в i18n init: `errors` має бути в `ns: [...]`.
- Додати fallback `t('errors:server.generic', 'Помилка сервера')`.

---

### BUG-011 🐛 — Сортування кімнат: старі першими, без сортування

**Блок репорту:** 6.4  
**Severity:** Medium (UX)

**Repro:**
- Створити 4 кімнати підряд.
- Дашборд показує їх у порядку створення (стара першою).
- Немає dropdown для зміни порядку.
- Немає поля "Last activity" / "Created at" на картці.

**Запропонований фікс:**
- Сортування за замовчуванням: `lastActiveAt DESC` (нові першими).
- На картці показати `Created: дд.мм.рррр`.
- (Опційно) dropdown сортування: name / created / activity.

---

### BUG-012 🐛 — Немає кнопок видалити/редагувати кімнату

**Блок репорту:** 6.5  
**Severity:** Medium (фіча відсутня)

**Repro:**
- На картці кімнати немає кнопок видалити, перейменувати, змінити систему.
- Hover не показує меню "три крапки".

**Запропонований фікс:**
- Додати dropdown-меню `⋮` на картці з опціями:
  - Edit name / system
  - Delete (з підтвердженням)
- Сервер: `PATCH /api/rooms/:id`, `DELETE /api/rooms/:id` (з cascading delete сцен/токенів).

---

## ⚠️ MINOR — Polish, UX, Tech Debt

---

### MIN-001 ⚠️ — Cold start UX: синій порожній екран без loader

**Блок:** 1.1  
**Опис:** При cold start Render-сервера (~30 сек) користувач бачить просто синій фон. Іноді треба натиснути F5 щоб щось з'явилось.  
**Фікс:** Loader/спінер з повідомленням "Підключення до серверу..." + retry після 30 сек.

---

### MIN-002 ⚠️ — Немає home page / лендінгу

**Блок:** 1.2  
**Опис:** Відкриття `/` показує форму логіну. Незрозуміло що це за платформа, для кого, які фічі.  
**Фікс:** Створити мінімальний лендінг з description проекту, скріншотами, CTA "Try free". Це важливо для презентації диплома.

---

### MIN-003 ⚠️ — Заглушка замість логотипу/назви платформи

**Блок:** 1.2  
**Опис:** Логотип VTT — placeholder, нема брендингу.  
**Фікс:** Створити мінімальний SVG-логотип. Назва: "VTT" / або щось ширше для тези.

---

### MIN-004 ⚠️ — Не можна обрати тему/мову на сторінці login

**Блок:** 1.3, 1.4  
**Опис:** Перемикачі теми та мови доступні тільки після логіну (через user-меню).  
**Фікс:** Додати floating перемикачі у footer/header auth-screen.

---

### MIN-005 ⚠️ — Немає toast-вітання після успішної реєстрації

**Блок:** 2.4  
**Опис:** Після Submit перекидає на My rooms без жодного feedback.  
**Фікс:** Toast "Welcome, {name}!" з 3-секундним fadeout.

---

### MIN-006 ⚠️ — "Registering..." зависає на 1 хв при дублікаті email (cold start)

**Блок:** 2.3.5  
**Опис:** Перший раз реєстрація на існуючий email завмерла на ~60 сек, потім швидко. Це cold start manifestation, але юзер не знає.  
**Фікс:** Timeout на front-end + повідомлення "Сервер прокидається, потерпіть...".

---

### MIN-007 ⚠️ — Немає ліміта кількості кімнат на користувача (DoS surface)

**Блок:** 6.4  
**Опис:** Можна створити будь-яку кількість кімнат, флудити БД.  
**Фікс:** Soft limit 20 кімнат на free-користувача. У відповіді 403 "ROOM_LIMIT_REACHED".

---

### MIN-008 ⚠️ — Немає maxLength на text input (валідація тільки на сервері)

**Блок:** 5.2 (релевантно для всіх форм)  
**Опис:** Зв'язано з BUG-004. Усі форми треба перевірити на наявність maxLength + character counter.  
**Фікс:** Standard input wrapper з prop `maxLength` що автоматично рендерить counter "32/100".

---

## ✅ OK — Працює правильно

| Тест                          | Блок  | Зауваження                  |
| ----------------------------- | ----- | --------------------------- |
| Console чиста на старті       | 1.1   |                             |
| Перемикач теми тогл           | 1.3   | (працює, але див. BUG-006)  |
| Перемикач мови UK/EN          | 1.4   |                             |
| Мова персистить після F5      | 1.4   |                             |
| Email format валідація        | 2.3.2 |                             |
| Min password length 8         | 2.3.3 |                             |
| Email already registered      | 2.3.5 | UI ОК, but див. MIN-006     |
| Реєстрація → My rooms         | 2.4   |                             |
| Auto-login після реєстрації   | 2.4   |                             |
| Логін → Dashboard             | 3.3   |                             |
| "Unauthorized" при невірних даних | 3.2 | Допустимий security pattern |
| Сесія персистить F5 (1 раз)   | 3.4   | (але див. BUG-007)          |
| Empty state Dashboard         | 4.1   |                             |
| Tab "Запрошений" empty state  | 4.2   | "No active invitations"     |
| Створення кімнати — happy     | 5.4   | Toast + миттєвий рендер     |
| Картка кімнати — basic info   | 6.1   |                             |
| Пошук кімнат                  | 6.2   |                             |
| Перехід на Lobby              | 7.1   |                             |

---

## 🚧 ЗАБЛОКОВАНО ТЕСТУВАННЯ

> Не можна продовжувати без фіксу BUG-001 та BUG-002.

| Блок | Розділ                    | Причина блокування            |
| ---- | ------------------------- | ----------------------------- |
| 7.6  | Управління учасниками     | BUG-001 (нема Player у списку)|
| 7.7  | Вхід у GameRoom разом      | BUG-001                       |
| 8    | GameRoom перший погляд    | BUG-001                       |
| 9    | Scene Manager             | (можна тестувати тільки GM)   |
| 10   | Canvas + tokens           | BUG-001 (sync between GM/PL)  |
| 11   | Анотації                  | BUG-001                       |
| 12   | Чат                       | BUG-001                       |
| 13   | Кубики                    | (можна частково — solo GM)    |
| 14   | Initiative Tracker        | BUG-001                       |
| 15   | Character Sheet           | BUG-001 (різні ролі)          |
| 16   | Handouts                  | BUG-001 (передача гравцю)     |
| 17   | Notes                     | (можна частково — solo GM)    |
| 18   | Audio                     | BUG-001                       |
| 19   | AI Assistant              | (можна — тільки GM)           |
| 20   | WebRTC                    | BUG-001                       |

**Висновок:** з 22 блоків ~17 заблоковані напряму або частково. Тому план зараз — fix wave перед продовженням.

---

## 📋 НАСТУПНІ КРОКИ

1. ✅ **Цей документ** — bug reports готові.
2. ⏭️ **Створити план фіксів** — `fix_plan_2026-05-03.md` з пріоритетами, оцінкою часу, послідовністю.
3. ⏭️ **Реалізація** — за планом.
4. ⏭️ **Повторний тест** — `qa_report_2026-05-XX_round2.md` (новий чистий документ, починається з блоку 1, верифікує fix кожного бага).
5. ⏭️ **Якщо всі CRITICAL + 80% BUG зачинено** → продовжити блоки 8–22.

---

## 📎 Додатки

- **Скріни:** `_chats_and_ai/qa_reports/screens/` (Лев додає окремо).
- **Сирі нотатки тестера:** `qa_report_2026-05-02_RAW_NOTES.md` (історія).
- **Архітектура:** Bible §2.18 RBAC (для верифікації BUG-003), §2.16 Communication (для invite endpoints).

# Bible Patches — Round 1 (післявхвильова синхронізація)

**Створено:** 2026-05-03  
**Базується на:** звітах агентів Wave 1.1, 1.2, 2+3, 4, 5.  
**Призначення:** структурований перелік змін до `PROJECT_BIBLE.md` після виконання Round 1 фіксів.

---

## Принцип

Всі патчі вносяться **інкрементально**, в існуючі підрозділи. Якщо підрозділу немає (наприклад нова таблиця змін у §2.16) — додати компактний абзац у тіло, не створювати окремий пункт без потреби.

Кожен патч нижче має:
- **Розділ Bible** — куди вносити
- **Що додати** — текст або табличний рядок
- **Контекст** — чому це треба (для розуміння агентом)

Стиль — академічна українська, як у решті Bible.

---

## §1 — Брендинг (новий компактний абзац у п. 1, після таблиці ідентифікації)

**Що додати:**

> **Брендинг.** Платформа використовує умовну назву "VTT Platform". Маркетингова tagline: укр. — "Віртуальний стіл для настільних рольових ігор із підтримкою AI"; англ. — "AI-assisted virtual tabletop for tabletop RPGs". Логотип — стилізоване зображення ігрового кубика d20 (правильного двадцятигранника) з технічним рендером через `currentColor`, що забезпечує адаптацію до активної теми (light/dark) без додаткових SVG-ассетів.

**Контекст:** Тестер відмітив відсутність брендингу та tagline. У Wave 5.6 додано Landing + логотип, потрібна академічна фіксація.

---

## §2.4 Ф2 — Управління кімнатами (доповнення таблиці вимог)

**Що додати** (нові рядки після Ф2.3 — або інтегрувати у відповідні існуючі):

| ID | Вимога | Опис |
|---|---|---|
| Ф2.6 | Edit room | GM-власник може змінювати назву та ігрову систему кімнати через `PATCH /api/rooms/:id`. Інші ролі — 403. |
| Ф2.7 | Delete room | GM-власник може видалити кімнату через `DELETE /api/rooms/:id`. Видалення каскадне (Scene → Token, Handout → Recipient, ChatMessage, Note, AudioTrack, Character, RoomMember, Asset). Перед видаленням з БД сервер emit-ить WSS `room:deleted` усім клієнтам у кімнаті, щоб ті встигли коректно вийти. |
| Ф2.8 | Room limit | На одного користувача — не більше 20 кімнат (env-override `ROOM_LIMIT_PER_USER`). При перевищенні `POST /api/rooms` повертає 403 з кодом `ROOM_LIMIT_REACHED`. |

**Що змінити в існуючому розділі (life-cycle опис):**

Старий запис (приблизно): "кімнату створює будь-який auth user → стає GM"  
**Замінити на:** "Життєвий цикл кімнати: `created → lobby → active (session running) → deleted (cascade)`. Створює будь-який автентифікований користувач (`role='user'`), що автоматично стає GM-власником. Observer (`role='observer'`) створювати кімнати не може (RBAC, §2.18)."

---

## §2.10 UI View — оновлена UI-структура

**Що додати** в кінець розділу (після списку UI-патернів):

> **Оновлення Round 1 (Wave 5).** До переліку 10 екранів додано **Landing screen** — точку входу для неавтентифікованих відвідувачів без `?invite=` query-параметра. Layout: hero-блок (логотип + назва + tagline) + три CTA (Register / Sign In / Observer) + блок з трьома картками-фічами (canvas, AI-асистент, голосовий зв'язок) + footer. Auth-screens (Login / Register / ObserverEntry) тепер містять у правому верхньому куті floating-controls з ThemeToggle та LanguageSwitcher, що дозволяє обрати тему та локаль ще до автентифікації; стан зберігається в localStorage і застосовується до `<html data-theme>` через inline-script у `index.html` ще до першого React-рендеру (запобігає flash of unstyled theme).

> **BootstrapLoader (Wave 3.2).** При статусі сесії `bootstrapping` рендериться чотиристадійний loader: 0–3с — спінер; 3–15с — повідомлення "Connecting to server"; 15–45с — "Server is waking up" (cold start Render); 45+с — кнопка Retry. Це закриває одну з НФВ 3 (надійність) UX-вимог щодо cold start.

**Контекст:** Wave 3.2 + Wave 5.4 + Wave 5.6 змінили UI-shell.

---

## §2.14 Process View — оновлений Player Join sequence

**Що додати** (новий блок або заміна існуючої sequence-діаграми Player Join, якщо вона є):

> **Player Join (оновлено в Round 1, Wave 2.1).** Послідовність:
> 1. GM створює invite через `POST /api/rooms/:id/invites`, отримує дві посилання (player + observer).
> 2. Player відкриває URL `/?invite=<TOKEN>` у браузері.
> 3. Якщо Player не автентифікований → редірект на форму логіну/реєстрації; токен зберігається у redux state (`prefilledInviteCode`) і не зникає з URL до підтвердження.
> 4. Після успішного логіну/реєстрації клієнт відправляє `POST /api/rooms/join` з тілом `{ token }`.
> 5. Сервер: `RoomService.joinByInvite()` upsert-ить запис `RoomMember` (roomId+userId, role='Player'); повертає `RoomDTO` з оновленим `members[]`.
> 6. Сервер: emit WSS `room:member-joined` (broadcast) з payload `MemberJoinedPayload { roomId, member }`.
> 7. Клієнт-приєднант: dispatch `setCurrentRoom(room)` + redirect у Lobby, toast "Приєднано до кімнати X".
> 8. Усі інші клієнти у Lobby (включно з GM): обробляють WSS-подію через `socket.on('room:member-joined', upsertRoomMember)` — список members оновлюється real-time без F5.

> **Observer Join (оновлено в Round 1, Wave 2.2).** Якщо неавтентифікований відвідувач відкриває URL з `?invite=<TOKEN>`, клієнт автоматично переключає `authView` на Observer-форму та pre-fill-ить поле invite code (поле disabled, щоб юзер не міг його змінити). Юзер вводить лише ім'я → `POST /api/rooms/join-invite` створює анонімного User (з sentinel `passwordHash=''`) + видає Observer-токен з `boundRoomId` (§2.18). Observer ніколи не досягає Dashboard — клієнтський `App.tsx` тримає його в RoomLobby/GameRoom тієї однієї кімнати; Logout — єдиний спосіб вийти.

**Контекст:** До Wave 2.1 RoomMember-таблиці взагалі не існувало (R-Persistent-Membership була позначена "Deferred"). Тепер це повноцінна частина flow.

---

## §2.15 Data View — оновлення статусу RoomMember

**Що змінити:**

У відповідній примітці про `R-Persistent-Membership` (швидше за все десь у §2.15 або §3 у статусних таблицях) — змінити статус з **"Deferred"** на **"Done (Wave 2.1)"**.

**Що додати** (новий запис у переліку сутностей, якщо його там не було):

> **RoomMember.** Persistent membership-таблиця, що зв'язує User з Room та зберігає per-room Role (`'GM' | 'Player' | 'Observer'`). Унікальний ключ — пара `(roomId, userId)`. CASCADE on delete від Room. Заповнюється: при створенні кімнати (owner → role='GM'), при `POST /api/rooms/join` (token-based, role='Player'). Ця таблиця замінила γ-варіант проекції з §2.15 (попередньо membership виводилось через `Character.ownerId`, що було тимчасовим рішенням).

> **Room.lastActiveAt** (нове поле, Wave 4.2). `TIMESTAMPTZ NOT NULL DEFAULT now()`. Оновлюється через `RoomService.touchActivity(roomId)` при значущих подіях (start session, перше повідомлення в чаті у вікні 5хв, тощо). Використовується для сортування списку кімнат у Dashboard (`?sort=lastActive`, default).

---

## §2.16 Communication View — нові endpoints + WSS events

**Що додати** в табличці REST-ендпоінтів:

| Метод | Шлях | Auth | Призначення |
|---|---|---|---|
| `PATCH` | `/api/rooms/:id` | jwtAuth + GM/Player + ownerId match | Оновлення name/gameSystem кімнати власником. Body validate via `roomUpdateSchema`. |
| `DELETE` | `/api/rooms/:id` | jwtAuth + GM/Player + ownerId match | Видалення кімнати з cascading; emit `room:deleted` перед DB-операцією. |
| `GET` | `/api/rooms?sort=...&order=...` | jwtAuth + GM/Player | Sort: `lastActive` (default) / `created` / `name`; order: `desc` (default) / `asc`. |
| `POST` | `/api/rooms/join` | jwtAuth | (вже існував) Player join via invite token. **Оновлено Wave 2.1:** тепер upsert-ить RoomMember + emit WSS `room:member-joined`. |

**Що додати** в табличці WSS-подій:

| Подія | Напрямок | Payload | Призначення |
|---|---|---|---|
| `room:member-joined` | S→C broadcast | `MemberJoinedPayload { roomId, member: RoomMemberDTO }` | Real-time оновлення списку members у Lobby/GameRoom. |
| `room:deleted` | S→C broadcast | `RoomDeletedPayload { roomId, reason? }` | Сповіщення усіх клієнтів про видалення кімнати (перед DB-cascade), щоб встигли вийти. |

**Що додати** як новий компактний абзац (на початку або в кінці розділу):

> **Validation pipeline (Wave 1.1).** Усі mutating-ендпоінти (POST/PATCH) захищені middleware `validate(schema)` (`apps/server/src/middleware/validate.ts`), що виконує `Zod.safeParse(req.body)`. На fail повертає `400 { code: 'VALIDATION_FAILED', message, issues }` ще до сервісного шару — це прибирає Postgres `VarChar` overflow як джерело 500-помилок. Zod-схеми в `apps/server/src/schemas/` (одна на доменний агрегат): `room`, `scene`, `token`, `character`, `note`, `handout`, `chat`. Усі ліміти — суворіші за відповідні Prisma `VarChar(N)` для гарантії 400-шляху до DB-виклику.

> **Auth resilience (Wave 2.3 + 3.1).** Клієнтський `apiFetch` має refresh-on-401 retry (один раз) та 60-секундний timeout через `AbortController`; на timeout кидає `ApiError(0, 'errors:network.timeout')`. `bootstrapSession` thunk розрізняє `AbortError` (залишається `bootstrapping` для retry) від HTTP 401 (clear tokens → idle) від мережевих помилок (status='error' з opцією retry).

---

## §2.18 Security View — двошарова роль і scope-binding

**Що додати** (новий підрозділ або абзац у відповідне місце; орієнтуватись на існуючу структуру §2.18):

> **Дворівнева роль у JWT.** `UserPublic.role` (account-tier: `'user' | 'observer'`) — тип акаунта: `'user'` покриває реєстрованих GM/Player, `'observer'` — анонімних глядачів, створених через `POST /api/rooms/join-invite`. Окремо, `req.user.role` (per-room, `Role = 'GM' | 'Player' | 'Observer'`) — JWT claim, що перевіряється middleware `requireRole(...allowedRoles)` (`apps/server/src/middleware/rbac.ts`). Ці два рівні незалежні: account-tier визначає здатність створювати/реєструватися, per-room — права в межах конкретної кімнати.

> **`boundRoomId` — Observer scope-binding.** При видачі Observer-токена (`AuthService.issueObserverTokens(userPublic, roomId, ua)`) у access-JWT записується `boundRoomId` — UUID кімнати, у яку Observer був запрошений. Middleware `requireBoundRoom` для observer-токенів перевіряє `req.user.boundRoomId === req.params.id`; для звичайних `'user'`-токенів middleware пропускає без перевірки. Ендпоінти, недоступні Observer (`POST /api/rooms`, `GET /api/rooms` list, edit/delete), захищені `requireRole('GM','Player')`.

> **Клієнтське enforce.** `App.tsx` перевіряє `selectIsObserver`: якщо `true` і `currentRoom` ще не завантажений — диспатчить `fetchRoom(boundRoomId)` автоматично. Observer ніколи не досягає Dashboard. Кнопки повернення (Back у GameRoomTopBar та RoomLobby) для observer-сесії викликають `logout()` замість `clearRoom()` — щоб не залишити юзера у стані "authenticated observer без кімнати".

**RBAC матриця (оновлення):** статус observer permissions для `POST /api/rooms`, `GET /api/rooms (list)`, `PATCH/DELETE /api/rooms/:id` — позначити як **enforced via requireRole** (раніше було позначено як design-only).

---

## §3 Актори — уточнення Observer

**Що додати** (доповнення опису ролі Observer):

> **Observer scope-binding (Wave 1.2).** Observer-сесія прив'язана до конкретної кімнати через `boundRoomId` у JWT. Observer не має Dashboard-видимості, не може створювати кімнати, не бачить чужих кімнат. Анонімний User (з sentinel `passwordHash=''`) створюється тільки в момент `POST /api/rooms/join-invite`; повторний логін через `POST /api/auth/login` для нього неможливий (bcrypt mismatch). Тривалість Observer-сесії — звичайний access TTL (15 хв) + refresh TTL (30 днів); після `logout()` сесія знищується безповоротно.

---

## §5 НФВ — обсяги та надійність

**Що додати** до НФВ 6 (Обсяги):

> **Кількість кімнат на користувача:** ≤ 20 (default, налаштовується через `ROOM_LIMIT_PER_USER` env). При перевищенні `POST /api/rooms` → 403 `ROOM_LIMIT_REACHED`.

**Що додати** до НФВ 3 (Надійність) — компактна примітка:

> **Cold start UX (Wave 3.2).** Клієнтський BootstrapLoader має чотири стадії повідомлень (spinner → connecting → waking up → retry-кнопка через 45с) для покриття Render cold start (~30с) без deceptively-empty UI.

---

## Що перевірити після застосування

1. Усі патчі додаються **інкрементально** у відповідні підрозділи — не створювати дублюючі підрозділи "Round 1 changes" окремо.
2. Стиль: академічна українська, без markdown-emojis (✓ ❌), без коду в backticks для бізнес-описів.
3. Якщо §X.Y містить таблицю — додавати рядок туди, не створювати окрему таблицю поряд.
4. Зберегти PROJECT_BIBLE.md — це канонічний файл, валідація формату важлива.
5. Після правок прогнати швидкий smoke-перегляд: чи відкривається у markdown-рендері, чи нумерація розділів не зламана.

---

## Контрольний перелік розділів, які треба чіпнути

- [ ] §1 (брендинг — нова примітка)
- [ ] §2.4 Ф2 (3 нових рядки + lifecycle оновлення)
- [ ] §2.10 UI View (Landing + auth toggles + BootstrapLoader)
- [ ] §2.14 Process View (Player Join + Observer Join sequence updates)
- [ ] §2.15 Data View (RoomMember статус + lastActiveAt поле)
- [ ] §2.16 Communication View (REST + WSS таблиці + validation pipeline + auth resilience)
- [ ] §2.18 Security View (дворівнева роль + boundRoomId + RBAC матриця update)
- [ ] §3 Актори (Observer scope-binding доповнення)
- [ ] §5 НФВ 6 та НФВ 3 (room limit + cold start UX)

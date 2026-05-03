# 🔧 Fix Plan — Round 2

**Створено:** 2026-05-04  
**База:** `_chats_and_ai/qa_reports/round2/backlog.md` (12 CRITICAL, 7 BUG, 15+ MINOR)  
**Принцип:** **зверху вниз** — спочатку безпекова основа, потім error UX, потім invite-flow, потім решта.

---

## 🧭 Логіка послідовності

Round 1 зробила 5 хвиль. Round 2 виявила що **дві з них не спрацювали end-to-end**:

- **Wave 1.2 (RBAC + boundRoomId)** — JWT все ще `role: "Player"` для observer, без `boundRoomId`. 8 unit-тестів проходили, реальний flow зламаний. **Це BUG-003 повторення.**
- **Wave 3.2 (BootstrapLoader)** — спільний `status: 'error'` для bootstrap і form rejected → BootstrapLoader на login 401, register 409, invalid invite. **Це source 4-х нових багів R2.**

Round 2 також виявила нові архітектурні gaps:
- **Asset upload endpoints не існують** на сервері (LEV-MANUAL-001).
- **AI chat не persist-иться** (LEV-MANUAL-004).
- **Sort direction чисто декоративний** (B6-BUG-002).

```
┌──────────────────────────────────────────────────────────┐
│ WAVE 6.1 — SECURITY FOUNDATION                            │
│   BUG-003 реальний фікс (observer JWT + boundRoomId)      │
│   End-to-end test (not synthetic JWT)                     │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ WAVE 6.2 — ERROR STATE ARCHITECTURE                       │
│   Розділити status: 'error' на bootstrap/authForm/transient │
│   Закриває R2-BUG-004, R2-BUG-005, B7-BUG-003            │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ WAVE 6.3 — INVITE FLOW END-TO-END                         │
│   B7-BUG-001 (Player URL → Observer form)                 │
│   B7-BUG-004 (Toast Storm)                                │
│   BUG-001-F5 (Player F5 kicks to Dashboard)               │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ WAVE 6.4 — ASSET + AI PERSISTENCE                         │
│   POST /api/assets/uploads + finalize endpoints            │
│   AI chat history DB model                                │
│   RecentGenerations інтеграція                             │
│   (паралельно з 6.5 може йти)                             │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ WAVE 6.5 — HIGH-PRIORITY BUGS                             │
│   B6-BUG-002 sort direction                                │
│   BUG-007 F5 race на real keypress                         │
│   R2-BUG-006 logout 503                                    │
│   R2-REG-002 zod на /auth/register                         │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ WAVE 6.6 — POLISH                                         │
│   Logo redesign + favicon, footer, copy fixes,             │
│   theme на game screens, dropdown closing, toasts         │
└──────────────────────────────────────────────────────────┘
```

**Bible-sync:** окремою гілкою у диплома (як qa-round1-drafts-sync). Назва: `qa-round2-drafts-sync`.

---

# 🌊 WAVE 6.1 — SECURITY FOUNDATION

## 6.1.1 — BUG-003 реальний фікс (Observer JWT з role:"observer" + boundRoomId)

**Сформулюй проблему:**

Wave 1.2 спроектувала дворівневу роль (account-tier `'user'|'observer'` vs per-room `'GM'|'Player'|'Observer'`). На код-рівні все було, **але `AuthService.issueObserverTokens()` все ще видає JWT з `role: "Player"` без `boundRoomId`**. Результат — observer проходить `requireRole('GM','Player')` як Player, може створювати кімнати (POST `/api/rooms` → 201), бачити My rooms.

Доказ з Block 7 (B7-BUG-002): observer-токен декодований показує `{ role: "Player" }`, без `boundRoomId`. POST /api/rooms з цим токеном → 201 Created.

### Кроки

1. **Перевір `apps/server/src/services/AuthService.ts`** метод `issueObserverTokens(userPublic, roomId, ua)`:
   - Чи правильно передає `role: "observer"` у `issueTokenPair`?
   - Чи `boundRoomId` доходить до `signAccess`?
   - Швидше за все десь у chain параметр губиться. Подивись що насправді записується в JWT.
   
   Можна декодувати токен через `jwt.io` або `javascript_tool` під час налагодження.

2. **`packages/shared/src/rest/index.ts` UserPublic.role:**
   - Тип `'user' | 'observer'` (account-tier).
   - У observer-flow має бути `'observer'`.

3. **JWT payload AccessPayload:**
   - `apps/server/src/middleware/jwtAuth.ts` declare global Request.user — `role: Role` зараз — це per-room `Role` (GM/Player/Observer). Треба:
     - Account-tier `accountRole?: 'user' | 'observer'` (опціональне, для observer)
     - Per-room `role: Role` (GM/Player/Observer)
   - АБО: вирішити що `role: 'Observer'` Bible-канонічна (що відповідає Bible §3 Актори), без розділення account-tier. Тоді просто перевіряти `req.user.role === 'Observer'` і `req.user.boundRoomId === req.params.id`.
   
   **Рекомендую другий варіант** — простіше і ближче до Bible §3.

4. **`requireRole`/`requireBoundRoom` middleware:**
   - `POST /api/rooms` має вимагати `requireRole('GM','Player')` — Observer заблокований.
   - `GET /api/rooms` (my rooms list) — те саме.
   - `GET /api/rooms/:id` — `requireBoundRoom` для Observer (тільки своя кімната).

5. **End-to-end тест:**
   ```ts
   // apps/server/tests/integration/observer-rbac.test.ts
   test('observer cannot create rooms (real flow)', async () => {
     // 1. GM creates room → invite link
     // 2. POST /api/rooms/join-invite with name → get observer JWT
     // 3. Decode JWT, verify role==='Observer' && boundRoomId===<roomId>
     // 4. POST /api/rooms with observer JWT → expect 403
     // 5. GET /api/rooms with observer JWT → expect 403
     // 6. GET /api/rooms/:otherId → expect 403
     // 7. GET /api/rooms/:boundId → expect 200
   });
   ```
   
   Це має бути integration test з реальним `issueObserverTokens()`, не synthetic JWT.

### Файли
```
apps/server/src/services/AuthService.ts                    [EDIT — verify issueObserverTokens]
apps/server/src/middleware/jwtAuth.ts                      [VERIFY — payload extraction]
apps/server/src/middleware/rbac.ts                         [VERIFY — requireRole accepts 'Observer']
apps/server/src/middleware/requireBoundRoom.ts             [VERIFY — checks boundRoomId match]
apps/server/src/routes/rooms.ts                            [VERIFY — middleware applied to right endpoints]
apps/server/tests/integration/observer-rbac.test.ts        [NEW — end-to-end real flow test]
packages/shared/src/rest/index.ts                          [VERIFY — UserPublic.role values]
```

### Bible-sync
- §2.18 RBAC матриця — поточний канон каже "enforced via requireRole". Round 2 показав що це не так. Або канон оновити після фіксу (коли реально enforced), або тимчасово позначити як "in progress".
- §3 Актори — Observer scope-binding має бути "implemented" після фіксу.

### Verify
- Server type-check + усі тести (включно з новим integration test) PASS.
- Manual smoke: тест-юзер створює кімнату, генерує observer invite, відкриває як observer, пробує POST /api/rooms через DevTools — має бути 403.

---

# 🌊 WAVE 6.2 — ERROR STATE ARCHITECTURE

## 6.2.1 — Розділити `status: 'error'` (R2-BUG-004 + R2-BUG-005 + B7-BUG-003)

**Сформулюй проблему:**

`apps/client/src/store/session.ts` має один `status: 'idle' | 'loading' | 'authenticated' | 'error'`. При `register.rejected`, `login.rejected`, observer-invite-fail, network-error на bootstrap — усі ставлять `status='error'`. `App.tsx:149` рендерить `BootstrapLoader networkError={true}` для **будь-якого** `status==='error'`.

Результат:
- Login невірний пароль → BootstrapLoader замість inline error.
- Register existing email → BootstrapLoader замість inline error.
- Observer invalid invite → BootstrapLoader замість inline error.

### Кроки

1. **Розділити стани:**
   ```ts
   interface SessionState {
     bootstrap: 'idle' | 'pending' | 'authenticated' | 'unauthenticated' | 'networkError';
     authForm: { status: 'idle' | 'pending' | 'success' | 'error'; error: string | null };
     transient: { error: string | null }; // для one-off toast errors як refresh 500
   }
   ```
   
   Або простіший варіант — додати `errorSource: 'bootstrap' | 'authForm' | 'transient' | null`:
   ```ts
   if (status === 'error' && errorSource === 'bootstrap') → BootstrapLoader;
   if (status === 'error' && errorSource === 'authForm') → форма залишається, error.message в `<p role="alert">`;
   ```

2. **Reducers (session.ts):**
   - `bootstrapSession.rejected` → `errorSource = 'bootstrap'`, status='error'.
   - `login.rejected` → `errorSource = 'authForm'`, не змінювати status з 'idle' (форма залишається відкритою).
   - `register.rejected` → те саме.
   - `observerJoin.rejected` → те саме.

3. **App.tsx:149** умова BootstrapLoader:
   ```tsx
   const showBootstrapLoader = 
     status === 'pending' /* bootstrap loading */ ||
     (status === 'error' && errorSource === 'bootstrap');
   ```

4. **Login.tsx / Register.tsx / ObserverEntry.tsx** показують inline error з store.error при `errorSource === 'authForm'`.

5. **Регресійні тести:**
   - `apps/client/src/pages/Auth/__tests__/Login.test.tsx` — `mocks store with login.rejected, expect form visible + error rendered, NOT BootstrapLoader`.
   - Те саме для Register, ObserverEntry.

### Файли
```
apps/client/src/store/session.ts                           [EDIT — split status / add errorSource]
apps/client/src/App.tsx                                    [EDIT — line 149 condition]
apps/client/src/pages/Auth/Login.tsx                       [VERIFY — error binding]
apps/client/src/pages/Auth/Register.tsx                    [VERIFY]
apps/client/src/pages/Auth/ObserverEntry.tsx              [VERIFY]
apps/client/src/pages/Auth/__tests__/Login.test.tsx        [EDIT/NEW]
apps/client/src/pages/Auth/__tests__/Register.test.tsx     [EDIT/NEW]
```

### Bible-sync
- §2.10 UI View — оновити BootstrapLoader scope (тільки для bootstrap-рівня помилок).

---

# 🌊 WAVE 6.3 — INVITE FLOW END-TO-END

## 6.3.1 — B7-BUG-001: Player URL → Observer form (Wave 2.2 side-effect)

**Сформулюй проблему:**

`App.tsx:101` робить `setAuthView('observer')` для **будь-якого** `?invite=` параметра, навіть якщо це Player invite token. Player не може приєднатись через invite link унлогінений — потрапляє на Observer форму.

### Кроки

**Варіант A — token type lookup endpoint (чистий):**
1. Сервер: `GET /api/rooms/invite/:token/type` → повертає `{ type: 'player' | 'observer' }` без авторизації (rate-limited).
2. Клієнт: при `?invite=` робить fetch endpoint, потім налаштовує authView відповідно.

**Варіант B — формат URL префікс (швидший):**
1. Сервер: invite generation повертає `playerUrl: ".../?invite=p_<TOKEN>"`, `observerUrl: ".../?invite=o_<TOKEN>"`.
2. Клієнт: `App.tsx` парсить prefix → `p_` → Login/Register, `o_` → ObserverEntry.

**Рекомендую Варіант B** — менше API, простіше, не потребує rate limit.

### Файли
```
apps/server/src/services/RoomService.ts            [EDIT — getInviteTokens prefix logic]
apps/server/src/routes/rooms.ts                    [VERIFY — /:id/invites returns prefixed URLs]
apps/client/src/App.tsx                            [EDIT — parse prefix, route accordingly]
apps/client/src/components/InviteLink/InviteLink.tsx  [EDIT — display prefixed URLs]
```

## 6.3.2 — B7-BUG-004: Toast Storm на Observer URL для залогіненого юзера

**Сформулюй проблему:**

Wave 2.1 додала useEffect що при `status === 'authenticated' && ?invite=` робить `POST /api/rooms/join`. Якщо залогінений user (account-tier='user') відкриває **Observer** invite → /rooms/join очікує Player токен → rejected → useEffect re-fires → 17+ toasts.

### Кроки

1. **Type-check перед dispatch:** після Wave 6.3.1 (prefix), якщо `?invite=o_<TOKEN>` і user залогінений як `'user'` (не observer) — НЕ робити /rooms/join. Натомість показати toast "Цей лінк для спостерігача. Вийдіть з акаунту або відкрийте у приватному вікні."
2. **Дебаунс на useEffect:** додати `useRef(false)` flag, set to true після першого fire, не повторювати.

### Файли
```
apps/client/src/App.tsx                            [EDIT — invite useEffect logic]
apps/client/src/locales/{uk,en}/auth.json          [EDIT — error key]
```

## 6.3.3 — BUG-001-F5: Player F5 кидає на Dashboard замість Lobby

**Сформулюй проблему:**

Player у Lobby робить F5 → `bootstrapSession` повертає authenticated, але `currentRoom = null` (не персистено в localStorage). App.tsx показує Dashboard з кімнатою у "Invited" tab. User думає що вийшов.

### Кроки

1. **App.tsx invariant:** при `authenticated && currentRoom === null` — fetch user's active rooms. Якщо є active session room → auto-redirect.
   
   Або: при `bootstrapSession.fulfilled` теж dispatch `fetchActiveRoom()` що повертає last-active room для user і ставить currentRoom.

2. **Альтернатива (простіше):** persist `currentRoomId` в localStorage. При bootstrap — якщо currentRoomId є → fetchRoom(currentRoomId), set currentRoom, redirect to Lobby.

### Файли
```
apps/client/src/store/room.ts                      [EDIT — persist currentRoomId]
apps/client/src/store/session.ts                   [EDIT — bootstrap restores currentRoomId]
apps/client/src/App.tsx                            [VERIFY — routing for restored state]
```

---

# 🌊 WAVE 6.4 — ASSET + AI PERSISTENCE

## 6.4.1 — LEV-MANUAL-001: POST /api/assets/uploads + finalize endpoints

**Сформулюй проблему:**

Клієнт викликає `POST /api/assets/uploads` (init upload) + `POST /api/assets` (finalize у GCS). У `apps/server/src/routes/assets.ts` ці методи відсутні — реалізовано лише GET. AI background upload + token upload + character PDF — все 404.

### Кроки

1. **DTO у `@vtt/shared`:** `AssetInitUploadRequest`, `AssetInitUploadResponse` (signed URL + assetId), `AssetFinalizeRequest`.
2. **Server `AssetService.initUpload()`** — генерує signed PUT URL для GCS, створює запис у БД зі статусом `pending`.
3. **Server `AssetService.finalizeUpload()`** — переключає `pending → ready` після того як клієнт зробив PUT у GCS.
4. **Routes:** `POST /api/assets/uploads` + `POST /api/assets/:id/finalize`. RBAC: тільки members кімнати.

### Файли
```
packages/shared/src/rest/index.ts                  [EDIT — add asset DTO]
apps/server/src/services/AssetService.ts           [EDIT — initUpload, finalizeUpload]
apps/server/src/routes/assets.ts                   [EDIT — POST endpoints]
apps/server/src/repositories/AssetRepository.ts    [VERIFY — has create/update]
apps/server/tests/integration/assets-upload.test.ts [NEW]
```

## 6.4.2 — LEV-MANUAL-002: Token file upload UI

**Сформулюй проблему:**

`AddTokenButton.tsx` + `TokenEditModal.tsx` приймають лише string URL. Сторонні URL не рендеряться через CORS на Konva canvas.

### Кроки

1. **Інтегрувати `<ImageUpload>` / `<AssetPicker>` у форми** — використовуючи endpoints з 6.4.1.
2. Позиція URL-поля — як advanced опція або взагалі прибрати (примусити upload).
3. Зображення зберігаються у нашому GCS bucket з правильним CORS — `useImage` хук рендерить без помилок.

### Файли
```
apps/client/src/components/Token/AddTokenButton.tsx       [EDIT]
apps/client/src/components/Token/TokenEditModal.tsx       [EDIT]
apps/client/src/components/AssetUpload/AssetUpload.tsx    [VERIFY — supports token kind]
```

## 6.4.3 — LEV-MANUAL-004: AI persistence (chat + media)

**Сформулюй проблему:**

AI LLM chat живе тільки в Redux client — F5 = втрата історії. Згенеровані images/music — RecentGenerations.tsx захардкоджений на моки, реальні URL не виводяться. Втрата даних.

### Кроки

1. **AI Chat persistence:**
   - `prisma/schema.prisma` додати модель `AssistantMessage { id, roomId, userId, role, content, createdAt }`.
   - Server: `POST /api/ai/messages` (зберегти), `GET /api/ai/messages?roomId=...` (історія).
   - Клієнт: `assistantSlice` — на mount fetch історії, на send — POST + optimistic update.

2. **RecentGenerations інтеграція:**
   - Server: `GET /api/assets?roomId=...&kind=ai-image,ai-music`.
   - Клієнт: `RecentGenerations.tsx` — замінити моки на реальний fetch + render.
   - При генерації нового — дописувати у список через store update.

### Файли
```
apps/server/prisma/schema.prisma                   [EDIT — AssistantMessage model]
apps/server/prisma/migrations/<new>                [NEW]
apps/server/src/services/AssistantService.ts       [VERIFY/EDIT]
apps/server/src/routes/ai.ts                       [EDIT — messages endpoints]
apps/client/src/store/assistant.ts                 [EDIT — fetch on mount]
apps/client/src/components/AssistantPanel/RecentGenerations.tsx  [EDIT — real data]
```

### Bible-sync
- §2.15 Data View — додати модель AssistantMessage.
- §2.16 Communication — додати `POST /api/ai/messages`, `GET /api/ai/messages`, `GET /api/assets?kind=...`.

---

# 🌊 WAVE 6.5 — HIGH-PRIORITY BUGS

## 6.5.1 — B6-BUG-002: Sort direction broken

**Проблема:** `Dashboard.tsx:76-81` `handleSortChange` оновлює React state, але `dispatch(fetchRooms())` без params. `store/room.ts:31-42` `fetchRooms` thunk не приймає args і не передає у URL.

### Кроки
1. `fetchRooms` thunk → `(opts?: { sort?: SortField; order?: SortOrder })`. Параметри у `?sort=...&order=...`.
2. `Dashboard.tsx` → `dispatch(fetchRooms({ sort, order }))`.
3. `RoomRepository.findByUserAndRole(_, _, { sort, order })` вже існує (з Wave 4.2) — verify працює.
4. Persist sort у localStorage (опційно).

## 6.5.2 — BUG-007 (повернувся): F5 race на real keypress

**Проблема:** Лев підтвердив руками — на localhost double-F5 виганяє на login. Wave 3.1 фікс не покриває real flow.

### Кроки
1. **Перевір `bootstrapSession` thunk:** при перерві (browser navigation) чи дійсно AbortController спрацьовує?
2. Може щось у сесії зберігається у sessionStorage що зникає при F5? Перевір.
3. Додати тест з реальним navigate event.

## 6.5.3 — R2-BUG-006: Logout 503

**Проблема:** `POST /api/auth/logout 503` — server не видаляє session. Refresh token живе ще 30 днів після logout = security issue.

### Кроки
1. **Знайти чому 503** — логи Express. Можливо jwtAuth race на expired access token (logout робиться без auth check?).
2. **Server:** logout endpoint має приймати або access token, або refresh token, або просто session ID body. Не падати якщо access expired.
3. **Client:** в `logout.rejected` теж dispatch `clearSession()` (зараз тільки в `fulfilled`).

## 6.5.4 — R2-REG-002: Zod на /auth/register

**Проблема:** Wave 1.1 пропустила auth endpoints. Name 200+ chars → 500 (Prisma crash). Password 200+ chars → 201 (bcrypt DoS).

### Кроки
1. `apps/server/src/schemas/auth.schema.ts` [NEW] — `registerSchema { name 1..50, email 1..254 valid, password 8..72 }`.
2. `apps/server/src/routes/auth.ts` POST `/register` → `validate(registerSchema)`.
3. Те саме для `/login` (хоч там SELECT-only — але DoS захист).

---

# 🌊 WAVE 6.6 — POLISH

> Можна паралельно після 6.1–6.4. Незалежні задачі.

## 6.6.1 — R2-BUG-001: Logo redesign + favicon

**Рекомендована реалізація — типографічна:**
- `apps/client/src/components/ui/Logo.tsx` — `VTT` як стилізований текст у fantasy шрифті (наприклад через CSS `font-family: 'Cinzel', serif` або SVG з кастомним path).
- `apps/client/public/favicon.svg` — той самий мінімальний логотип.
- `apps/client/index.html` — `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`.

## 6.6.2 — R2-BUG-002: Landing toggles binding

`apps/client/src/pages/Landing/Landing.tsx` — використати ті самі `ThemeToggle` + `LanguageSwitcher` що на Auth screens (інстанси через wrapper, не дубльована логіка).

## 6.6.3 — R2-BUG-003: Footer

Замінити `Thesis project · KPI · 2026` на `© 2026 VTT Platform · v0.X.X` (read version з `package.json` через Vite import).

## 6.6.4 — R2-BUG-NEW-001: Header кнопка "+ +"

`apps/client/src/pages/Dashboard/Dashboard.tsx` — у тексті кнопки прибрати `+`, залишити іконку SVG + чистий текст "Create Room" / "Створити кімнату".

## 6.6.5 — LEV-MANUAL-003: Theme toggle на game screens

Додати ThemeToggle + LangSwitcher у:
- `apps/client/src/pages/RoomLobby/RoomLobby.tsx` — у праву частину header.
- `apps/client/src/components/GameRoom/GameRoomTopBar.tsx` — у dropdown аватара (як у Dashboard UserChip).
- `apps/client/src/components/SceneEditor/EditorTopBar.tsx` — те саме що Lobby.

## 6.6.6 — B6-BUG-001: Dropdown click-outside / Escape

`apps/client/src/components/Dashboard/RoomCard.tsx` — `useClickOutside` hook + `useKeyDown('Escape')`.

## 6.6.7 — Copy fixes (з Лева human pass)

- **R2-COPY-001 (EN tagline):** `apps/client/src/locales/en/landing.json` → `tagline: "AI-assisted virtual tabletop for TTRPGs"` (замість дублюючого "tabletop").
- **R2-COPY-002 (UK русизм):** `apps/client/src/locales/uk/{landing,auth}.json` → `Зайти` → `Приєднатися` для Observer CTA.

## 6.6.8 — Решта minor

- **B6-MIN-001/002:** toast після Rename + Delete.
- **B5-MIN-002:** скоротити toast persistence до 4-5 сек.
- **B5-MIN-003:** локалізувати "Network error" toast.
- **R2-MIN-001:** прибрати HTML5 `required`, додати React inline error.
- **R2-MIN-002:** investigate /auth/refresh 500 race (Prisma rotateRefresh).
- **R2-MIN-003:** Password confirmation у Register (опційно).
- **R2-MIN-004 / R2-MIN-007:** "Back to landing" link на Login + Register.
- **R2-MIN-005:** auto-retry в BootstrapLoader.
- **R2-MIN-006:** Logout → Landing замість Login form.
- **R2-MIN-NEW-001..003:** search empty state, counter consistency, "Bad Request" toast localization.

---

# 📋 ЧЕКЛИСТ ВИКОНАННЯ

## Wave 6.1 — Security Foundation
- [ ] 6.1.1 BUG-003 реальний фікс (observer JWT)
- [ ] End-to-end RBAC test з real `issueObserverTokens`

## Wave 6.2 — Error State
- [ ] 6.2.1 Розділити `status: 'error'` (R2-BUG-004 + R2-BUG-005 + B7-BUG-003)

## Wave 6.3 — Invite Flow
- [ ] 6.3.1 Player vs Observer URL prefix (B7-BUG-001)
- [ ] 6.3.2 Toast Storm fix (B7-BUG-004)
- [ ] 6.3.3 F5 у Player → Lobby (BUG-001-F5)

## Wave 6.4 — Asset + AI
- [ ] 6.4.1 Asset upload endpoints (LEV-MANUAL-001)
- [ ] 6.4.2 Token file upload UI (LEV-MANUAL-002)
- [ ] 6.4.3 AI chat + media persistence (LEV-MANUAL-004)

## Wave 6.5 — High-Priority
- [ ] 6.5.1 Sort direction (B6-BUG-002)
- [ ] 6.5.2 F5 race investigation (BUG-007)
- [ ] 6.5.3 Logout 503 (R2-BUG-006)
- [ ] 6.5.4 Zod /auth/register (R2-REG-002)

## Wave 6.6 — Polish
- [ ] 6.6.1 Logo + favicon redesign
- [ ] 6.6.2 Landing toggles binding
- [ ] 6.6.3 Footer
- [ ] 6.6.4 Header кнопка
- [ ] 6.6.5 Theme на game screens
- [ ] 6.6.6 Dropdown closing
- [ ] 6.6.7 Copy fixes
- [ ] 6.6.8 Решта minor (8+ задач)

---

# 🔁 ПІСЛЯ ВИКОНАННЯ

1. Type-check + усі тести: `npm run check && npm run test` (root + apps).
2. **Round 3 verification testing** — повторний прохід Block 7 (найкритичніший — chec BUG-003 справді закритий end-to-end).
3. **Bible-sync на гілці `qa-round2-drafts-sync`** у diploma repo:
   - §2.18 RBAC матриця — оновити "enforced" статус після фактичного фіксу.
   - §2.10 UI View — BootstrapLoader scope.
   - §2.15 Data View — AssistantMessage model.
   - §2.16 Communication — нові asset/AI endpoints + URL prefix logic.

---

# 🧠 КЛЮЧОВІ УРОКИ З ROUND 1 ДЛЯ ROUND 2

1. **Юніт-тести з synthetic JWT не верифікують RBAC.** Потрібен integration з реальним `issueObserverTokens`.
2. **Spawn dev-agent — це не гарантія фіксу.** Перевіряй як саме implementовано (як було з Wave 1.2).
3. **Wave 3.2 BootstrapLoader — приклад "одна фіча → 4 нових бага".** Архітектурне рішення (status='error' = один стан для всіх помилок) було поспішним.
4. **Manual exploration Льова знаходить те що агент пропускає** — 4 серйозні баги (LEV-MANUAL-*) які агент Round 2 би не знайшов навіть на Block 9-19.

Round 2 обов'язково мала бути end-to-end multi-window. Без Block 7 ми б не виявили BUG-003 регресію.

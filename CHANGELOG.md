# Changelog

Усі помітні зміни цього проєкту документуються в цьому файлі.

Формат базується на [Keep a Changelog](https://keepachangelog.com/uk/1.1.0/),
проєкт дотримується [Semantic Versioning](https://semver.org/lang/uk/).

---

## [Unreleased] — гілка `claude/nostalgic-almeida-402b37`

> AI rework: conversation threads, SSE streaming, session-context injection (X1-lite),
> Player SRD, multi-turn image conversation (Nano Banana 2), Gemini 3 Flash Preview
> як default text-model, thinking budget toggle, AI quota endpoint, Asset.source
> taxonomy, action buttons. Плюс merge-readiness fix-cycle (S-Fix1–7).

### Added — функціональність

- **GM AI assistant — conversation threads** з rename / delete / per-context фільтром (NPC / Scene / SRD / Free) — Etap 3 master-plan v1.
- **SSE streaming** для LLM-відповідей через `gemini-3-flash-preview` (env-overridable). Throttled redux flush 50 ms на клієнті, abort-on-client-close, **15-секундний `: keep-alive\n\n` heartbeat** на 3 SSE-routes — Etap 4 + S-Fix2.
- **Edit-and-resend + regenerate** у streaming-режимі. Edit на server-side приймає будь-який msgId; UI наразі обмежує до last user msg (branching у [phase2_backlog.md B.5](./_chats_and_ai/plans/phase2_backlog.md)).
- **Session context injection (X1-lite)** через user-toggle `useSessionContext`. `SessionContextBuilder` агрегує active scene + initiative order + party characters + last 5 chat lines і ін'єктує markdown-блок між system-prompt і history. Ⓘ-button для preview через `GET /ai/conversations/:id/context-preview` — Etap 5.
- **Player SRD popover** — окрема read-only Q&A-точка для гравців, доступна через 📖 кнопку в Canvas Toolbar. Окремий rate-limit `srdRateLimiter` 5/min/user (не вичерпує GM-quota) — Etap 6.1.
- **Action buttons на assistant-відповідях**: «В нотатки» (creates JournalEntry з title-truncate ≤60), «У чат» (broadcasts IC chat message), «Згенерувати знову». Toast-feedback на success/error. **Hidden during streaming** (S-Fix5.1) — захист від empty/partial content sends — Etap 6.2.
- **Multi-turn image conversation** через Nano Banana 2 (`gemini-3.1-flash-image-preview`, region `global`): нові aggregate `AssistantImageConversation` + `AssistantImageTurn` (1:N), turn-based pattern з re-feed prior outputs у history, ≤3 reference assets per turn. UI — `ImageThreadList` + `ImageThreadView` у Image-tab. **GM-only** на CREATE через `requireRoomGM` middleware (S-Fix1) — post-master-plan.
- **AI quota endpoint** `GET /ai/quota?roomId=…` — реальні `{images, audio, llm}` 24h + total counters з `Asset.source` enum-фільтром і `AssistantMessage` historical count — post-master-plan + Etap 6.3.
- **Asset taxonomy**: новий enum `Asset.source: AssetSource ('UPLOAD'|'AI_IMAGE'|'AI_AUDIO')` (default `'UPLOAD'`, additive migration з backfill), `Asset.aiPrompt TEXT?`, `Asset.aiModel VARCHAR(64)?`. Endpoint `GET /assets?source=ai` — фільтрація AI-генерованих assets — post-master-plan.
- **Thinking budget toggle (low / high)** для `gemini-3-flash-preview` — opt-in user-toggle (default low), localStorage-persisted. High = unlimited budget (~6× ціни). Locale tooltip пояснює trade-off — post-master-plan.
- **GeminiProvider extensions**: `generateTextStream(prompt, signal, opts)` — SSE-stream через `models.generateContentStream`; `generateImageMultiTurn(req)` — NB2 multi-turn з in-history re-feed; `thinkingLevel` параметр через `opts`. `DisabledAIProvider` оновлено для нових методів — Etap 4 + post-master-plan.
- **Error taxonomy** в AIProvider: `AIQuotaError`, `AISafetyError`, `AIInvalidPromptError`, `AINetworkError`. Mapping в HTTP кодах: 503 (quota) / 422 (safety) / 400 (invalid) / 504 (network) — Etap 1.2.
- **Rate-limit headers** (`X-RateLimit-Remaining`) проксяться у клієнтський redux state, badge у header `AssistantPanel` показує лічильник, warning-style при ≤2 — Etap 2.1.
- **Preset chips** 4×5 (по 5 пресетів на 4 контексти) у LLM-tab — Etap 2.2.
- **Player SRD popover** — `BookOpen`-кнопка в Canvas Toolbar (доступна всім ролям, на відміну від ✨ AI-кнопки яка тільки для GM).
- **RBAC integration tests** — нова інтеграційна suite [`ai-routes-rbac.test.ts`](./apps/server/tests/integration/ai-routes-rbac.test.ts) з 4 кейсами (Player→403, Outsider→403, GM→201, no-auth→401) — S-Fix1.
- **SSE keepalive helper** [`apps/server/src/lib/sseStream.ts`](./apps/server/src/lib/sseStream.ts) — extracted SSE-bootstrap (headers + heartbeat + abort) з 3 routes; 6 fake-timer unit-тестів пінять timer-логіку — S-Fix2.
- **Env-overridable AI models**: `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_NB2_MODEL`, `GEMINI_MUSIC_MODEL`. Defaults — поточні preview (per project decision). Conditional spread + `??` уникає `undefined` під `exactOptionalPropertyTypes` — S-Fix3.

### Changed

- **Default text-model:** `gemini-2.5-flash` → `gemini-3-flash-preview` (preview-tier, env-overridable). Region: `us-central1` → `global` (required для preview-models, документовано в `.env.example`).
- **Default image generation для `/ai/image`:** залишається `gemini-2.5-flash-image` (GA). Multi-turn — окрема модель `gemini-3.1-flash-image-preview`.
- **POST `/ai/image-conversations`:** додано `requireRoomGM` middleware — закриває cost-amplification вектор (Player JWT не може створити image-thread).
- **Locale `recent.quotaHeading`:** `"Ліміти"` → `"AI-використання"` (відображає реальні counters, не статичні ліміти).
- **`AssistantMessage`:** додано nullable `conversationId` + `context` — legacy-rows backfill-ені у migration `20260509000000_conversation_threads`.
- **DialogList фільтр:** контекст-чіпи замість dropdown; per-thread rename / delete actions через `window.prompt`/`confirm` (UX-debt — [phase2_backlog.md](./_chats_and_ai/plans/phase2_backlog.md)).
- **Image-tab UI:** legacy one-shot `GeneratePanel` замінений на `ImageThreadList + ImageThreadView` (multi-turn flow). Music-tab — без змін, все ще `GeneratePanel`.
- **Send shortcut:** залишається Ctrl+Enter (UX-debt: industry-baseline Enter-to-send — [phase2_backlog.md](./_chats_and_ai/plans/phase2_backlog.md)).

### Fixed

- **S-Fix5.1 — message actions hidden during streaming** ([commit `3f266f7`](./apps/client/src/components/AssistantPanel/ConversationView.tsx)): To-Notes / To-Chat / Copy / Regenerate buttons рендерилися на streaming-placeholder з порожнім content. «В нотатки» отримував 400 (`title.min(1)` zod-rule); «У чат» silently broadcast-ив порожній IC. Фікс: `MessageActions` early-returns null коли `msg.role === 'assistant' && isLastMsg && status === 'sending'`. Defense-in-depth: handlers додатково bail-аут на empty content — race-safety проти stale closures.
- **3 stale client tests** після рефакторингу UI ([commit `ce29c54`](./apps/client/src/components/AssistantPanel/__tests__/AssistantPanel.test.tsx)): «LLM tab shows empty state» очікував `/Задайте питання/` — seed-store з активною conversation; «Image tab shows Generate button» — кнопка `'Генерувати'` зникла після multi-turn rework, замінена на `'+ Нова сцена'`; `RecentGenerations.test.tsx` — `'Ліміти'` → `'AI-використання'`. Прибрано `vi.restoreAllMocks()` з `afterEach` (скидав `apiFetch.mockResolvedValue` між тестами, ламав `getAIQuota(...).catch(...)`).

### Security

- **S-Fix1 — закрита RBAC-діра на `/ai/image-conversations` CREATE** ([commit `db11c1c`](./apps/server/src/routes/ai.ts)): тільки GM може створити image-thread (`requireRoomGM` middleware). Закриває cost-amplification вектор: NB2 — preview-tier, нестабільна ціна, Player JWT не може burn-нути проектний бюджет. Перевірено через RBAC integration tests + live curl на `localhost:4005`.

### Reliability

- **S-Fix2 — SSE keepalive heartbeat 15с** ([commit `759f0c1`](./apps/server/src/lib/sseStream.ts)): запобігає proxy idle-drop на повільних preview-генераціях (text TTFB ≈10s, NB2 ≈15s). Helper `lib/sseStream.ts` уніфікує SSE-bootstrap у 3 routes. 6 fake-timer unit-тестів покривають header-setup + heartbeat-cadence + cleanup + race-safety + data-frame-format + abort-on-close.

### Migrations (additive, no downtime)

- `20260508044257_asset_source` — `Asset.source AssetSource DEFAULT 'UPLOAD'` enum + `aiPrompt`/`aiModel` columns + backfill для legacy rows.
- `20260508055519_image_conversations` — `AssistantImageConversation` + `AssistantImageTurn` (1:N з UNIQUE `(conversationId, turnIndex)`).
- `20260509000000_conversation_threads` — `AssistantConversation` + nullable `conversationId`/`context` колонки на `AssistantMessage` + INSERT-backfill default-conversation per room для legacy messages.

### Documentation

- [_chats_and_ai/plans/ai_panel_rework_master_plan.md](./_chats_and_ai/plans/ai_panel_rework_master_plan.md) — оригінальний master-plan v1 (frozen).
- [_chats_and_ai/plans/ai_panel_rework_master_plan_v2_addendum.md](./_chats_and_ai/plans/ai_panel_rework_master_plan_v2_addendum.md) — addendum до v1 (delta-документ).
- [_chats_and_ai/plans/current_state_analysis_2026_05_08.md](./_chats_and_ai/plans/current_state_analysis_2026_05_08.md) — консолідований analysis з 3 аудитів (UX, master-plan execution, deploy-readiness).
- [_chats_and_ai/plans/merge_readiness_fix_plan.md](./_chats_and_ai/plans/merge_readiness_fix_plan.md) — formal plan для S-Fix1–7.
- [_chats_and_ai/plans/prompt_engineering_v2_master_plan.md](./_chats_and_ai/plans/prompt_engineering_v2_master_plan.md) — детальний plan для phase 2a (P1-P5.4 з research-гайду).
- [_chats_and_ai/plans/phase2_backlog.md](./_chats_and_ai/plans/phase2_backlog.md) — авторизація scope-creep + open backlog (18 пунктів).
- ~~`_chats_and_ai/plans/bible_sync_pending.md`~~ — Bible-deltas accumulator. **Застосовано 2026-05-09** до `c:\Users\Semyvolos\Desktop\4 курс\Диплом\PROJECT_BIBLE.md` (S-Fix7); файл видалено після успішної синхронізації. PROJECT_BIBLE.md містить inline-блоки `*Sync 2026-05-09 (AI rework):*` у §1, §2.3, §2.13, §2.14, §2.15, §2.16, §2.18, плюс ІМ 11–15 у §10 та рядки 9–24 у §13.
- [_chats_and_ai/plans/ai_rework_gemini3_probe_results.md](./_chats_and_ai/plans/ai_rework_gemini3_probe_results.md) — probe-результати NB2/NB3/Gemini 3 на Vertex AI (обґрунтування для preview-defaults).
- [_chats_and_ai/plans/ai_rework_nano_banana_research.md](./_chats_and_ai/plans/ai_rework_nano_banana_research.md), [_chats_and_ai/plans/ai_rework_nano_banana_rnd.md](./_chats_and_ai/plans/ai_rework_nano_banana_rnd.md) — R&D-нотатки.
- `.env.example` — додано 4 model-override-перемінні + GA-fallbacks + регіональні обмеження.

### Breaking changes

- `GCP_LOCATION=us-central1` без додатково встановлених `GCP_TEXT_LOCATION=global` / `GCP_IMAGE_LOCATION=global` дасть **404** на preview-моделях (`gemini-3-flash-preview`, `gemini-3.1-flash-image-preview`). Дефолти у коді — `'global'`, але якщо в Render-env є явне `GCP_*_LOCATION=us-central1` — переписує дефолт. Документовано в `.env.example`.

### Test coverage

| Suite | Раніше | Зараз |
|---|---|---|
| Server tests | 359/359 | **420/420** (+10 від fix-cycle: 4 RBAC + 6 SSE heartbeat) |
| Client tests | 408/410 (3 stale fail) | **410/410** ✅ |
| Server lint / type-check | ✅ | ✅ |
| Client lint / type-check | ✅ | ✅ |

### Known UX-debt (не блокує merge)

- Fullscreen modal-overlay для AssistantPanel — приховує канвас/чат під час AI-роботи. Side-dock — phase 2b.
- Stop-generation UI button — backend AbortController готовий, UI відсутній.
- Branching edit — backend підтримує any msgId, UI gates тільки last user msg.
- Auto-title треда з першого user-msg — індустрія-baseline 2022+, не реалізовано.
- Cross-context search для тредів — DialogList фільтрує per-context, без full-text search.
- localStorage `useSessionContext` — глобальний для всіх кімнат (не per-room).
- Send shortcut Ctrl+Enter (industry-baseline Enter, Shift+Enter — newline).

Повний реєстр — у [phase2_backlog.md](./_chats_and_ai/plans/phase2_backlog.md) Розділ B (18 пунктів).

---

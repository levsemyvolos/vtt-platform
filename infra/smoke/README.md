# Smoke Flow — VTT Platform

8-кроковий end-to-end перевірочний прохід через ключові ФВ після деплою
(відповідь Чату 8 на пункт 8 завдання).

| # | Шар | Запит | ФВ |
|---|---|---|---|
| 1 | REST | `POST /auth/login` | Ф1.2 |
| 2 | REST | `POST /rooms` | Ф2.1 |
| 3 | REST | `POST /rooms/:id/scenes` | Ф3.1 |
| 4 | REST | `PATCH /scenes/:id { isActive }` | Ф3.2 |
| 5 | REST | `GET /scenes/:id` | Ф3.3 |
| 6 | **WSS** | `dice:roll` → `dice:rolled` | Ф5.1 |
| 7 | REST | `POST /ai/generate-image` | Ф8.2 |
| 8 | REST + GCS | `POST /audio` → PUT GCS → `POST /audio/:id/finalize` | Ф6.1 |

## Як запускати

REST-частину (кроки 1–5, 7, 8a/8c):

1. У VS Code встановити розширення **REST Client** (Huachao Mao) або
   IntelliJ HTTP Client.
2. Відкрити `smoke.http`, оновити `@apiBase`, `@gmEmail`, `@gmPassword`.
3. Виконувати запити **зверху вниз** — змінні `accessToken`, `roomId`,
   `sceneId` автоматично підставляються з відповідей попередніх кроків.

WSS-частину (крок 6) — окремий Node-скрипт:

```bash
node infra/smoke/socket-smoke.mjs <accessToken> <roomId> https://vtt-server.onrender.com
```

GCS-частину (крок 8b — реальний `PUT` файлу) — `curl`:

```bash
curl -X PUT -H "Content-Type: audio/mpeg" \
     --upload-file ./tavern.mp3 \
     "<uploadUrl з відповіді 8a>"
```

## Очікувані результати

- Кроки 1–5: HTTP 200/201, JSON з UUID-сутностями.
- Крок 6: лог `[ok] dice:rolled → {…}` ≤ 200 мс після emit (НФВ 2.2).
- Крок 7: HTTP 200 з `assetId`, `mimeType: "image/png"`, `signedUrl`
  (presigned URL GCS, TTL 15 хв — Bible §2.13.4 / Чат 5).
- Крок 8c: HTTP 200, `audioTrack: { id, sceneId: null, loop: false }`.

Якщо будь-який крок повертає 401 — перевірити, що `JWT_SECRET` Render
збігається з тим, яким підписувалися токени локально (це різні екземпляри
для local/cloud). Якщо 503 на кроках 7–8 — у Render Environment не
заповнені `GCP_*` / `GCS_BUCKET` (див. `apps/server/src/index.ts:79-100`).

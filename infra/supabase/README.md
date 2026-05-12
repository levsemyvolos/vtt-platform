# Supabase — PostgreSQL host for VTT Platform

Розгортання вузла `PostgreSQL Server` на managed-PG Supabase.

## 1. Створення проєкту

1. <https://supabase.com> → **New project**.
2. Region: `eu-central-1` (Frankfurt) — мінімізує RTT до Render Frankfurt.
3. Plan: **Free** (500 МБ, ≤ 60 одночасних з'єднань — достатньо для MVP;
   для §3.15 volume-test 100k/50k/5M використовувати локальну Postgres
   через `docker-compose.yml` цього репозиторію).
4. Database password — згенерувати ≥ 32 символи, зберегти в password manager.

## 2. Connection string

Supabase надає два URL у Settings → Database → Connection string:

| Тип | Коли використовувати |
|---|---|
| **Direct connection** (`postgres://...:5432/postgres`) | `prisma migrate deploy`, локальний `prisma migrate dev`, `prisma studio` |
| **Session pooler** (`postgresql://...:6543/postgres?pgbouncer=true`) | runtime Render-сервісу (Prisma Client) |

> Для Prisma з PgBouncer обов'язково додати параметр `?pgbouncer=true&connection_limit=1`
> — інакше prepared statements ламаються.

## 3. Початкові міграції

Виконати один раз з локальної машини або CI runner:

```bash
cd vtt-platform/apps/server
DATABASE_URL="<DIRECT_CONNECTION_URL>" pnpm exec prisma migrate deploy
```

Що відбувається:
- Prisma застосує всі файли з `prisma/migrations/` (зокрема
  `20260430041908_vertical2_realtime/migration.sql`).
- Створиться службова таблиця `_prisma_migrations` для трекінгу.
- Схема відповідатиме `prisma/schema.prisma`.

## 4. Інтеграція з Render

У `apps/server/render.yaml` визначено:

```yaml
preDeployCommand: pnpm --filter @vtt/server exec prisma migrate deploy
```

Render запускає цю команду до старту нового екземпляра — нові міграції
застосовуються атомарно перед перемиканням трафіку.

`DATABASE_URL` у Render Dashboard має містити **session pooler URL**
(порт `6543`), бо runtime використовує велику кількість короткоживучих
з'єднань через Prisma Client.

## 5. Резервне копіювання

Free plan: щоденні автоматичні бекапи (Supabase Dashboard → Database →
Backups), retention 7 днів. Для дипломного MVP цього достатньо;
для продакшну — Pro plan з Point-in-Time Recovery.

## 6. Обмеження Free plan

- 500 МБ — для §3.15 (volume test 100k users + 50k rooms + 5M ChatMessage)
  не вистачить. Volume-тести — на локальній PG в Docker.
- Pause after 7 days inactivity. Перед демо на захисті — викликати будь-який
  REST-ендпоінт за добу.
- ≤ 60 одночасних з'єднань pooler-режиму. Mesh ≤ 6 учасників (§2.13.4)
  не наближається до ліміту.

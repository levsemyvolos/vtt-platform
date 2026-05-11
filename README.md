# VTT Platform

Virtual Tabletop platform — diploma thesis project, Chapter 3 implementation.

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Client UI | React | 18.x |
| Client Canvas | Konva.js | 9.x |
| Client 3D Dice | dice-box (Three.js + Cannon-es) | 1.x |
| Client State | Redux Toolkit + react-redux | 2.x / 9.x |
| Client WS | socket.io-client | 4.x |
| Server Runtime | Node.js LTS | 20.x |
| Server HTTP | Express.js | 4.x |
| Server WS | socket.io | 4.x |
| Database | PostgreSQL | 16.x |
| ORM | Prisma | 5.x |
| AI | Vertex AI (Gemini Flash 3 / 3.1 Flash Image / Lyria 3) | API v1 |
| Storage | Google Cloud Storage | SDK 7.x |
| TURN | coturn | 4.x |
| Language | TypeScript | 5.x strict |

## Deployments

| Component | Host | URL | Plan |
|---|---|---|---|
| Client SPA | Vercel | `https://vtt-client.vercel.app` | Hobby |
| App Server | Google Cloud Run | `https://vtt-server-<hash>.a.run.app` | min-instances=1, 512Mi/0.5 vCPU, `europe-central2` |
| PostgreSQL | Supabase | `eu-central-1` (Frankfurt) | Free |
| TURN | GCP e2-micro VM, `us-central1-f` | `turn:turn.vtt.example.com:3478?transport=udp` / `turns:...:5349?transport=tcp` | Free trial $300 |
| Source | GitHub | `https://github.com/levsemyvolos/<repo>` | — |

> URL заглушки замінити на реальні після першого деплою; цей блок —
> джерело істини для §3.5 «Стратегія доставки» Розділу 3.
> Legacy Render-конфіг збережено у `apps/server/render.yaml.legacy` для історії
> (міграція з Render Free → Cloud Run виконана через `.github/workflows/ci.yml`
> deploy-job: build Docker → push до Artifact Registry → `gcloud run deploy`).

CI/CD: Vercel auto-deploy на push у `main` (Client), GitHub Actions job
`deploy` (`.github/workflows/ci.yml:42`) збирає Docker і деплоїть у Cloud Run,
далі окремий step синхронізує Cloud Run URL у `apps/client/vercel.json`.
Prisma-міграції — ручні (`prisma migrate deploy`) через локальний `DIRECT_URL`,
бо Supabase Free pooler не пропускає DDL.
Pre-merge gate — GitHub Actions workflow `.github/workflows/ci.yml`
(type-check + lint + test).

## Local Development

```bash
cp .env.example .env          # fill DATABASE_URL, GCP creds, JWT_SECRET, TURN_*
docker compose up -d          # postgres:16 + coturn:4 (only for §3.15 volume test)
pnpm install --frozen-lockfile
pnpm --filter @vtt/server exec prisma migrate deploy
pnpm dev                      # client :5173, server :4000
```

## Build (production-equivalent)

```bash
pnpm install --frozen-lockfile
pnpm --filter @vtt/server exec prisma generate
pnpm type-check               # MERGE GATE — must pass
pnpm lint
pnpm test
pnpm --filter @vtt/client build   # → apps/client/dist (deployed by Vercel)
pnpm --filter @vtt/server start   # tsx src/index.ts (no tsc emit, Bible §10.1)
```

## CI Scripts (root)

| Script | What it does |
|--------|-------------|
| `pnpm type-check` | `tsc --noEmit` across all workspaces in parallel — **CI merge gate** |
| `pnpm lint` | ESLint across all workspaces in parallel |
| `pnpm test` | Vitest across all workspaces in parallel |
| `pnpm dev` | Client + server dev servers in parallel |

## Workspace Layout

```
apps/
  client/                   — React 18 + Vite + Konva + Redux Toolkit
    vercel.json             — Vercel build config (monorepo-aware)
  server/                   — Express 4 + socket.io 4 + Prisma 5 + tsx (no tsc build)
    render.yaml.legacy      — архів старої Render-конфігурації (до міграції на Cloud Run)
    Dockerfile              — single-stage node:20-alpine, build for Cloud Run via Artifact Registry
packages/
  shared/                   — TS DTO interfaces (no build; exports ./src/index.ts)
infra/
  coturn/                   — turnserver.conf + GCP e2-micro deploy guide
  supabase/                 — connection-string + prisma migrate deploy guide
  smoke/                    — 8-request smoke flow (REST .http + socket-smoke.mjs)
.github/workflows/ci.yml    — type-check / lint / test on PR
docker-compose.yml          — postgres:16 + coturn:4 for §3.15 volume test
```

## Demo Credentials (local dev)

| Role | Email | Password |
|------|-------|----------|
| Game Master | `gm@test.com` | `password123` |
| Player | `player@test.com` | `password123` |
| Observer | `http://localhost:5173/observer?code=<inviteCode>` | — |

> Облікові записи створюються автоматично через `POST /auth/register`. Invite-код отримати через `POST /rooms/:id/invites` (поле `observerToken`).

## Smoke Checklist (Chat 7.11)

Full browser smoke + REST API smoke documented in
[`apps/client/docs/SMOKE_CHECKLIST.md`](apps/client/docs/SMOKE_CHECKLIST.md).

**Results:** 60/62 pass, 2 skipped (GCS audio upload + WebRTC camera in headless),
0 fail. Screenshots: [`apps/client/docs/screenshots/`](apps/client/docs/screenshots/) (39 PNG files).

**Coverage (server services):** AuthService 57%, DiceService 97%, SceneService 71%,
AssistantService 100%, SessionResyncService 100%. All target services ≥ 50% ✅.

## Smoke check after deploy

See `infra/smoke/README.md` for the 8-step flow:
login → create room → create scene → activate scene → get scene →
WSS dice roll → AI image gen → audio upload (presigned PUT GCS).

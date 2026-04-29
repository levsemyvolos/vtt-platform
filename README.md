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

- **Client**: [Vercel](https://vercel.com)
- **Server**: [Render](https://render.com)
- **Database**: [Supabase](https://supabase.com) (PostgreSQL 16)
- **TURN**: coturn 4.x on Oracle Cloud Always Free VPS (UDP 3478 / TLS 5349)

## Local Development

```bash
cp .env.example .env          # fill DB_URL, GCP credentials, JWT_SECRET
docker compose up -d          # postgres:16 + coturn:4
pnpm install
pnpm dev                      # client :5173, server :4000
```

## CI Scripts (root)

| Script | What it does |
|--------|-------------|
| `pnpm type-check` | `tsc --noEmit` across all workspaces in parallel |
| `pnpm lint` | ESLint across all workspaces in parallel |
| `pnpm test` | Vitest across all workspaces in parallel |
| `pnpm dev` | Client + server dev servers in parallel |

## Workspace Layout

```
apps/
  client/    — React 18 + Vite + Konva + Redux Toolkit
  server/    — Express 4 + socket.io 4 + Prisma 5 + tsx (no tsc build)
packages/
  shared/    — TypeScript DTO interfaces (no build step; exports ./src/index.ts)
infra/
  coturn/    — turnserver.conf for local Docker and Oracle Cloud VPS
docker-compose.yml  — postgres:16 + coturn:4 for local dev and volume tests (§ 3.15)
```

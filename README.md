# VTT Platform

Virtual Tabletop — веб-платформа для проведення настільних рольових ігор онлайн. Дипломна робота.

## Можливості

- Спільний Canvas з токенами персонажів та туманом війни
- Real-time синхронізація через WebSocket (socket.io)
- Вбудований AI-асистент (Gemini Flash) — генерація NPC, сцен, музики
- Відео/аудіо-чат через WebRTC (coturn TURN)
- Рольова система: GM / Гравець / Спостерігач
- 3D-кидання кубиків (dice-box / Three.js)

## Стек

| Рівень | Технологія | Версія |
|--------|-----------|--------|
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
| AI | Vertex AI (Gemini Flash 3 / Lyria 3) | API v1 |
| Storage | Google Cloud Storage | SDK 7.x |
| TURN | coturn | 4.x |
| Language | TypeScript | 5.x strict |

## Розгортання

| Компонент | Хост |
|-----------|------|
| Client SPA | Vercel |
| App Server | Google Cloud Run (`europe-central2`) |
| PostgreSQL | Supabase (Frankfurt) |
| TURN | GCP e2-micro VM |

## Локальний запуск

```bash
cp .env.example .env          # заповнити DATABASE_URL, GCP creds, JWT_SECRET, TURN_*
pnpm install --frozen-lockfile
pnpm --filter @vtt/server exec prisma migrate deploy
pnpm dev                      # client :5173, server :4000
```

## Тести та CI

```bash
pnpm type-check   # tsc --noEmit по всіх workspace
pnpm lint
pnpm test
```

CI: GitHub Actions (`.github/workflows/ci.yml`) — type-check + lint + test на кожен PR.
CD: Vercel (client) та Cloud Run (server) — автодеплой при push у `main`.

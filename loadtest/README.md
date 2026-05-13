# Load testing

Artillery-based load tests for §3.14 of the thesis.

## Files

- `scene-flow.yml` — primary scenario: ramped load 10 → 100 VU over five
  phases (30 s each, 60 s sustained at 100), targets `/health` and
  `/auth/login` → `/rooms` flow. Acceptance gate: p95 ≤ 2000 ms,
  error rate ≤ 5 %.

## Prerequisites

1. Server must be reachable. Default target is `http://localhost:4000`.
   For Railway production: `TARGET=https://obscure-vtt.up.railway.app`.
2. For the auth scenario, seed a test user beforehand (or comment out
   the second scenario):
   ```sql
   INSERT INTO "User" (id, email, password, name, "createdAt")
   VALUES (gen_random_uuid(),
           'loadtest@example.com',
           '$2b$12$<bcrypt-hash>',
           'Load Test',
           now());
   ```

## Run

```bash
pnpm exec artillery run loadtest/scene-flow.yml --output coverage/loadtest-report.json
pnpm exec artillery report coverage/loadtest-report.json
```

The HTML report is written next to the JSON; open it in a browser
to inspect per-phase latency histograms and request-count distributions.

## Telemetry

During the run, capture Railway Metrics dashboard screenshots
(CPU, RAM, response time, active connections) for §3.3 (Operational
View) and §3.14 (Load Test Protocol). Both subsections share the same
experiment — different aspects of the same data.

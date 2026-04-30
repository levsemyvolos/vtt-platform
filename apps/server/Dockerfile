# VTT Platform — App Server (Render Docker option, backup deploy path).
# Bible §2.12 row "App Server". Single-stage build per Chat 8 contract:
# the server runs through tsx (no tsc emit) — see Chat 1 / Bible §10.1.
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace manifests first — preserves layer cache when only sources change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# Sources — Prisma schema must be present before `prisma generate`.
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

RUN pnpm --filter @vtt/server exec prisma generate

EXPOSE 4000

CMD ["pnpm", "--filter", "@vtt/server", "start"]

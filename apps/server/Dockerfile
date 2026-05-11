# VTT Platform — App Server. Single-stage build per Chat 8 contract:
# the server runs through tsx (no tsc emit) — see Chat 1 / Bible §10.1.
# Deployed to Google Cloud Run via .github/workflows/ci.yml (replaces Render).
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace manifests first — preserves layer cache when only sources change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# Native bcrypt (QW-7) needs node-gyp + python + g++ on Alpine. Install as a
# virtual package so we can drop the toolchain after the binding is built —
# keeps the final image small.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && pnpm install --frozen-lockfile \
    && apk del .build-deps

# Sources — Prisma schema must be present before `prisma generate`.
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

RUN pnpm --filter @vtt/server exec prisma generate

EXPOSE 4000

CMD ["pnpm", "--filter", "@vtt/server", "start"]

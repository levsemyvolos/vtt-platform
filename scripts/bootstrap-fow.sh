#!/usr/bin/env bash
# FOW worktree bootstrap — створює ізольовану БД vtt_fow_test, накатує міграції.
# Безпечно запускати повторно (idempotent).
#
# Передумови:
#   - docker-compose стек з main worktree запущений (postgres на :5432)
#   - pnpm install уже виконаний у цьому worktree
#
# Використання:  bash scripts/bootstrap-fow.sh

set -euo pipefail

CONTAINER=$(docker ps --format "{{.Names}}" --filter "ancestor=postgres:16-alpine" | head -1)
if [ -z "$CONTAINER" ]; then
  echo "ERROR: postgres:16-alpine container is not running."
  echo "Start it from the main worktree with: docker compose up -d postgres"
  exit 1
fi
echo "Using postgres container: $CONTAINER"

docker exec -u postgres "$CONTAINER" psql -tc "SELECT 1 FROM pg_database WHERE datname='vtt_fow_test'" \
  | grep -q 1 \
  || docker exec -u postgres "$CONTAINER" psql -c "CREATE DATABASE vtt_fow_test OWNER vtt;"

echo "DB ready. Applying migrations..."
pnpm --filter @vtt/server exec prisma migrate deploy
pnpm --filter @vtt/server exec prisma generate

echo
echo "Done. Run two terminals:"
echo "  1) pnpm --filter @vtt/server dev      # http://localhost:4001"
echo "  2) pnpm --filter @vtt/client dev      # http://localhost:5174"
echo
echo "Open http://localhost:5174 in two browser windows (GM + Player) to test fog drag-marquee."

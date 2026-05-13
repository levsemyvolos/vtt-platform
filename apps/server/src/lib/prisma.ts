import { PrismaClient } from '@prisma/client';

// Cap Prisma's connection pool below PgBouncer's session-mode pool_size (15 on
// Railway). Without this, concurrent WSS bursts open unlimited connections and
// hit EMAXCONNSESSION. pool_timeout=20 ensures queued requests fail fast rather
// than piling up indefinitely.
const rawUrl = process.env.DATABASE_URL ?? '';
const dbUrl = rawUrl && !rawUrl.includes('connection_limit')
  ? `${rawUrl}?connection_limit=10&pool_timeout=20`
  : rawUrl;

export const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

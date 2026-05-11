-- QW-7: refresh-token storage switched from bcrypt(cost=12) to SHA-256.
-- Existing Session.refreshTokenHash rows hold bcrypt digests that the new
-- verifier (crypto.timingSafeEqual on sha256 hex) cannot match. Truncating
-- forces all active refresh tokens to re-authenticate (access TTL is 15 min,
-- so most users would have re-issued naturally within an hour anyway).
-- One-shot operation; safe to re-run (TRUNCATE is idempotent on empty table).

TRUNCATE TABLE "Session" RESTART IDENTITY CASCADE;

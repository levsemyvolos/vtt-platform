-- Observer isolation (§3): per-message delivery channel.
-- `public`   — visible to GM, Player and Observer (default for backfill).
-- `observer` — visible only to Observer members + GM.
--
-- The channel is derived server-side from the sender's per-room role;
-- the client cannot set it. See `ChatService.createMessage`.

CREATE TYPE "ChatChannel" AS ENUM ('public', 'observer');

ALTER TABLE "ChatMessage"
  ADD COLUMN "channel" "ChatChannel" NOT NULL DEFAULT 'public';

-- Optimises `listRecent(roomId, viewerRole='Player')` which filters
-- WHERE roomId=? AND channel='public' ORDER BY createdAt DESC.
CREATE INDEX IF NOT EXISTS "ChatMessage_roomId_channel_createdAt_idx"
  ON "ChatMessage"("roomId", "channel", "createdAt" DESC);

-- 1. Create the new conversation table
CREATE TABLE "AssistantConversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "context" VARCHAR(32) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantConversation_roomId_updatedAt_idx" ON "AssistantConversation"("roomId", "updatedAt");
CREATE INDEX "AssistantConversation_ownerId_idx" ON "AssistantConversation"("ownerId");

ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Add new columns to AssistantMessage as nullable so existing rows stay valid
ALTER TABLE "AssistantMessage" ADD COLUMN "conversationId" UUID;
ALTER TABLE "AssistantMessage" ADD COLUMN "context" VARCHAR(32);

-- 3. Backfill: create one default conversation per room that has legacy messages
INSERT INTO "AssistantConversation" ("id", "roomId", "ownerId", "context", "title", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    r."id",
    r."ownerId",
    'free-chat',
    'Архів історії',
    COALESCE(MIN(m."createdAt"), CURRENT_TIMESTAMP),
    COALESCE(MAX(m."createdAt"), CURRENT_TIMESTAMP)
FROM "Room" r
INNER JOIN "AssistantMessage" m ON m."roomId" = r."id"
GROUP BY r."id", r."ownerId";

-- 4. Link each legacy message to its room's default conversation
UPDATE "AssistantMessage" am
SET "conversationId" = ac."id",
    "context" = 'free-chat'
FROM "AssistantConversation" ac
WHERE ac."roomId" = am."roomId"
  AND ac."title" = 'Архів історії'
  AND am."conversationId" IS NULL;

-- 5. Now make the new columns NOT NULL
ALTER TABLE "AssistantMessage" ALTER COLUMN "conversationId" SET NOT NULL;
ALTER TABLE "AssistantMessage" ALTER COLUMN "context" SET NOT NULL;

-- 6. Add the FK + index for conversationId
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

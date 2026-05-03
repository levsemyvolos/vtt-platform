-- CreateTable: AssistantMessage
-- Persistent AI assistant chat messages per room (§2.15, Ф8.1)
-- F5-safe: history loaded from DB on mount.

CREATE TABLE "AssistantMessage" (
    "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId"    UUID NOT NULL,
    "userId"    UUID,
    "role"      VARCHAR(16) NOT NULL,
    "content"   TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AssistantMessage_roomId_createdAt_idx"
    ON "AssistantMessage"("roomId", "createdAt");

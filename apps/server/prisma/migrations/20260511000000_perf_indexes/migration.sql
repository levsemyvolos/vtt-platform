-- Performance indexes for foreign-key columns missing dedicated indexes.
-- Audit reference: §2 "Quick Wins" QW-6 — eliminates sequential scans on
-- dashboard listing (Room.findByUserAndRole), Asset library queries by owner,
-- chat history filtered by sender/recipient, audio tracks by scene, and
-- Character cascade-deletes by room/owner.

CREATE INDEX IF NOT EXISTS "Room_ownerId_lastActiveAt_idx"
  ON "Room"("ownerId", "lastActiveAt" DESC);

CREATE INDEX IF NOT EXISTS "Asset_ownerId_idx"
  ON "Asset"("ownerId");

CREATE INDEX IF NOT EXISTS "Token_assignedUserId_idx"
  ON "Token"("assignedUserId");

CREATE INDEX IF NOT EXISTS "ChatMessage_senderId_idx"
  ON "ChatMessage"("senderId");

CREATE INDEX IF NOT EXISTS "ChatMessage_recipientId_idx"
  ON "ChatMessage"("recipientId");

CREATE INDEX IF NOT EXISTS "AudioTrack_sceneId_idx"
  ON "AudioTrack"("sceneId");

CREATE INDEX IF NOT EXISTS "Character_roomId_idx"
  ON "Character"("roomId");

CREATE INDEX IF NOT EXISTS "Character_ownerId_idx"
  ON "Character"("ownerId");

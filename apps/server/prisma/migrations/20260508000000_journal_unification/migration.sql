-- 1) Create new schema
CREATE TYPE "JournalVisibility" AS ENUM ('private', 'shared');

CREATE TABLE "JournalEntry" (
    "id"         UUID              NOT NULL,
    "roomId"     UUID              NOT NULL,
    "authorId"   UUID              NOT NULL,
    "title"      VARCHAR(128)      NOT NULL,
    "body"       TEXT              NOT NULL,
    "visibility" "JournalVisibility" NOT NULL DEFAULT 'private',
    "assetId"    UUID,
    "createdAt"  TIMESTAMPTZ(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ(6)    NOT NULL,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JournalEntry_roomId_idx" ON "JournalEntry"("roomId");

CREATE TABLE "JournalRecipient" (
    "entryId"   UUID            NOT NULL,
    "userId"    UUID            NOT NULL,
    "grantedAt" TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalRecipient_pkey" PRIMARY KEY ("entryId","userId")
);

ALTER TABLE "JournalEntry"     ADD CONSTRAINT "JournalEntry_roomId_fkey"     FOREIGN KEY ("roomId")    REFERENCES "Room"("id")        ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "JournalEntry"     ADD CONSTRAINT "JournalEntry_authorId_fkey"   FOREIGN KEY ("authorId")  REFERENCES "User"("id")        ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "JournalEntry"     ADD CONSTRAINT "JournalEntry_assetId_fkey"    FOREIGN KEY ("assetId")   REFERENCES "Asset"("id")       ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalRecipient" ADD CONSTRAINT "JournalRecipient_entryId_fkey" FOREIGN KEY ("entryId")  REFERENCES "JournalEntry"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "JournalRecipient" ADD CONSTRAINT "JournalRecipient_userId_fkey"  FOREIGN KEY ("userId")   REFERENCES "User"("id")        ON DELETE CASCADE  ON UPDATE CASCADE;

-- 2) Migrate Notes → private entries
INSERT INTO "JournalEntry" ("id", "roomId", "authorId", "title", "body", "visibility", "assetId", "createdAt", "updatedAt")
SELECT "id", "roomId", "authorId", "title", "body", 'private', NULL, "updatedAt", "updatedAt"
FROM "Note";

-- 3) Migrate Handouts → shared entries (authorId = room.ownerId since handouts had none)
INSERT INTO "JournalEntry" ("id", "roomId", "authorId", "title", "body", "visibility", "assetId", "createdAt", "updatedAt")
SELECT h."id", h."roomId", r."ownerId", h."title", h."body", 'shared', h."assetId", h."createdAt", h."createdAt"
FROM "Handout" h
JOIN "Room" r ON r."id" = h."roomId";

-- 4) Migrate HandoutRecipient → JournalRecipient
INSERT INTO "JournalRecipient" ("entryId", "userId", "grantedAt")
SELECT "handoutId", "userId", "grantedAt"
FROM "HandoutRecipient";

-- 5) Drop legacy schema
DROP TABLE "HandoutRecipient";
DROP TABLE "Handout";
DROP TABLE "Note";

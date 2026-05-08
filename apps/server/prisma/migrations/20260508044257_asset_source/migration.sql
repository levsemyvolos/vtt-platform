-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('UPLOAD', 'AI_IMAGE', 'AI_AUDIO');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "aiModel" VARCHAR(64),
ADD COLUMN     "aiPrompt" TEXT,
ADD COLUMN     "source" "AssetSource" NOT NULL DEFAULT 'UPLOAD';

-- CreateIndex
CREATE INDEX "Asset_roomId_source_createdAt_idx" ON "Asset"("roomId", "source", "createdAt");

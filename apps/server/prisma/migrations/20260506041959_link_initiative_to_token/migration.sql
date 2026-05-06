-- AlterTable
ALTER TABLE "AssistantMessage" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InitiativeEntry" ADD COLUMN     "tokenId" UUID;

-- AlterTable
ALTER TABLE "RoomMember" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "InitiativeEntry_tokenId_idx" ON "InitiativeEntry"("tokenId");

-- AddForeignKey
ALTER TABLE "InitiativeEntry" ADD CONSTRAINT "InitiativeEntry_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

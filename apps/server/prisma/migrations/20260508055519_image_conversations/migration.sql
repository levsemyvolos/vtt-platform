-- CreateTable
CREATE TABLE "AssistantImageConversation" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AssistantImageConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantImageTurn" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "generatedAssetId" UUID,
    "referenceAssetIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantImageTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantImageConversation_roomId_updatedAt_idx" ON "AssistantImageConversation"("roomId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantImageConversation_ownerId_idx" ON "AssistantImageConversation"("ownerId");

-- CreateIndex
CREATE INDEX "AssistantImageTurn_conversationId_createdAt_idx" ON "AssistantImageTurn"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantImageTurn_conversationId_turnIndex_key" ON "AssistantImageTurn"("conversationId", "turnIndex");

-- AddForeignKey
ALTER TABLE "AssistantImageConversation" ADD CONSTRAINT "AssistantImageConversation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantImageConversation" ADD CONSTRAINT "AssistantImageConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantImageTurn" ADD CONSTRAINT "AssistantImageTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantImageConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantImageTurn" ADD CONSTRAINT "AssistantImageTurn_generatedAssetId_fkey" FOREIGN KEY ("generatedAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

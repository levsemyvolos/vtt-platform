-- AlterTable
ALTER TABLE "AssistantConversation" ADD COLUMN     "defaultOutputLanguage" VARCHAR(40),
ADD COLUMN     "defaultPlayerLevel" INTEGER,
ADD COLUMN     "defaultRuleset" VARCHAR(64),
ADD COLUMN     "defaultSetting" VARCHAR(280),
ADD COLUMN     "defaultTone" VARCHAR(120),
ALTER COLUMN "id" DROP DEFAULT;

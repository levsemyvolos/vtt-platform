-- CreateEnum
CREATE TYPE "AudioLayer" AS ENUM ('music', 'ambient', 'sfx');

-- AlterTable
ALTER TABLE "AudioTrack" ADD COLUMN     "layer" "AudioLayer" NOT NULL DEFAULT 'music';

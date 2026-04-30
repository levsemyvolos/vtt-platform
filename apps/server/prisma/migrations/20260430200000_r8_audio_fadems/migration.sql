-- AlterTable: add fade-in/out duration to AudioTrack (R8, Ф6.2)
ALTER TABLE "AudioTrack" ADD COLUMN "fadeMs" INTEGER NOT NULL DEFAULT 1500;

-- AlterTable: add JSONB column for persisted free-draw strokes (Ф3.4.2, §2.15).
ALTER TABLE "Scene" ADD COLUMN "annotations" JSONB;

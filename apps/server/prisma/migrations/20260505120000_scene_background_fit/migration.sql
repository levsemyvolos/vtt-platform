ALTER TABLE "Scene"
  ADD COLUMN "backgroundFit" TEXT NOT NULL DEFAULT 'cover',
  ADD COLUMN "backgroundOffsetX" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "backgroundOffsetY" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "backgroundScale" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- Existing scenes: preserve current visual rendering (stretch).
-- New scenes inserted later use 'cover' from the schema default.
UPDATE "Scene" SET "backgroundFit" = 'stretch';

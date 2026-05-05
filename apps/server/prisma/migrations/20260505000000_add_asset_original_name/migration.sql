-- Adds Asset.originalName for the rename feature (Fix 4 of Scene Editor redesign).
-- Backfill rule: derive a readable name from the existing storageKey suffix
-- (e.g. rooms/<uuid>/image/<uuid>.png → "<uuid>.png") so the unified Asset
-- Library shows the file's last-segment label instead of a sea of "unnamed" cards.
-- New uploads carry the real file.originalname from multer.

ALTER TABLE "Asset" ADD COLUMN "originalName" VARCHAR(128) NOT NULL DEFAULT '';

UPDATE "Asset"
SET "originalName" = COALESCE(
  NULLIF(reverse(split_part(reverse("storageKey"), '/', 1)), ''),
  'asset'
);

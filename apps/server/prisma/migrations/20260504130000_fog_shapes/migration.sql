-- Replace legacy fogMaskBase64 (column-major bit-grid) with fogShapes
-- (pixel-precise shape list per Ф3.3 / shape-list model).
-- Existing fog data is reset to NULL — per migration plan, MVP scenes
-- are repainted by the GM rather than auto-converted.

ALTER TABLE "Scene" DROP COLUMN "fogMaskBase64";
ALTER TABLE "Scene" ADD COLUMN "fogShapes" JSONB;

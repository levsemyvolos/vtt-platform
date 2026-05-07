import { z } from 'zod';
import type { SceneObject } from '@vtt/shared';

/**
 * Sess 8.3 — runtime validation schema for the SceneObject discriminated union.
 *
 * Used by the `object:upsert` socket handler to reject malformed payloads from
 * compromised clients (the only ingress where the server accepts a full
 * SceneObject body — most other endpoints take just an id + a few scalars).
 *
 * Field constraints mirror the existing per-type clamps applied by
 * SceneAnnotationService (text fontSize 8–200, stroke matrix scale 0.1–10).
 * Mismatched constraints would be a security defense-in-depth bug, so any
 * change to one location must be reflected in the other.
 */

const SceneObjectLayerSchema = z.enum(['tile', 'overlay']);
const SceneObjectVisibilitySchema = z.enum(['all', 'gm-only']);

const baseFields = {
  id: z.string().uuid(),
  userId: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
  zIndex: z.number().finite(),
  locked: z.boolean().optional(),
  rotation: z.number().finite().optional(),
  layer: SceneObjectLayerSchema,
  visibility: SceneObjectVisibilitySchema,
};

const TextSceneObjectSchema = z.object({
  ...baseFields,
  type: z.literal('text'),
  text: z.string().max(500),
  fontSize: z.number().int().min(8).max(200),
  color: z.string().max(32), // hex / rgb / named — kept loose
});

const ImageSceneObjectSchema = z.object({
  ...baseFields,
  type: z.literal('image'),
  assetId: z.string().uuid(),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});

const StrokeSceneObjectSchema = z.object({
  ...baseFields,
  type: z.literal('stroke'),
  points: z.array(z.number().finite()).min(2).max(20000), // 10000 segments cap
  color: z.string().max(32),
  strokeWidth: z.number().positive().max(64),
  scaleX: z.number().min(0.1).max(10).optional(),
  scaleY: z.number().min(0.1).max(10).optional(),
});

export const SceneObjectSchema = z.discriminatedUnion('type', [
  TextSceneObjectSchema,
  ImageSceneObjectSchema,
  StrokeSceneObjectSchema,
]);

/** Type-narrowing parse: returns parsed SceneObject or null. Logs nothing —
 *  callers decide whether to silently drop or surface the error. */
export function parseSceneObject(raw: unknown): SceneObject | null {
  const result = SceneObjectSchema.safeParse(raw);
  return result.success ? (result.data as SceneObject) : null;
}

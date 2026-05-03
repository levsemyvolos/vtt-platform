import { z } from 'zod';

/** DB: Scene.name VarChar(128) */
export const sceneCreateSchema = z.object({
  name: z
    .string({ required_error: 'Scene name is required' })
    .trim()
    .min(1, 'Scene name cannot be empty')
    .max(100, 'Scene name must be 100 characters or fewer'),
  gridSize: z
    .number({ required_error: 'gridSize is required' })
    .int()
    .min(20, 'gridSize must be at least 20')
    .max(200, 'gridSize must be 200 or fewer'),
  gridWidth: z.number().int().min(1).max(200).optional(),
  gridHeight: z.number().int().min(1).max(200).optional(),
  backgroundAssetId: z.string().uuid().optional(),
});

export const sceneUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Scene name cannot be empty')
    .max(100, 'Scene name must be 100 characters or fewer')
    .optional(),
  gridSize: z.number().int().min(20).max(200).optional(),
  gridWidth: z.number().int().min(1).max(200).optional(),
  gridHeight: z.number().int().min(1).max(200).optional(),
  backgroundAssetId: z.string().uuid().nullable().optional(),
  isHidden: z.boolean().optional(),
});

export type SceneCreateInput = z.infer<typeof sceneCreateSchema>;
export type SceneUpdateInput = z.infer<typeof sceneUpdateSchema>;

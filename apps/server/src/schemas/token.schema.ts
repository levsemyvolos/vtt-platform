import { z } from 'zod';

/** DB: Token.name VarChar(64) */
export const tokenCreateSchema = z.object({
  name: z
    .string({ required_error: 'Token name is required' })
    .trim()
    .min(1, 'Token name cannot be empty')
    .max(60, 'Token name must be 60 characters or fewer'),
  x: z.number({ required_error: 'x coordinate is required' }),
  y: z.number({ required_error: 'y coordinate is required' }),
  imageAssetId: z.string().uuid().optional(),
  color: z.string().max(32).optional(),
  assignedUserId: z.string().uuid().optional(),
});

export const tokenUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Token name cannot be empty')
    .max(60, 'Token name must be 60 characters or fewer')
    .optional(),
  hp: z.number().int().nullable().optional(),
  maxHp: z.number().int().nullable().optional(),
  color: z.string().max(32).optional(),
  statusMarkers: z.array(z.string().max(32)).max(20).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  isHidden: z.boolean().optional(),
  imageAssetId: z.string().uuid().nullable().optional(),
});

export type TokenCreateInput = z.infer<typeof tokenCreateSchema>;
export type TokenUpdateInput = z.infer<typeof tokenUpdateSchema>;

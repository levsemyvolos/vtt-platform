import { z } from 'zod';

/** DB: Character.name VarChar(128) */
export const characterCreateSchema = z.object({
  name: z
    .string({ required_error: 'Character name is required' })
    .trim()
    .min(1, 'Character name cannot be empty')
    .max(100, 'Character name must be 100 characters or fewer'),
  sheetData: z.unknown().optional(),
});

export const characterUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Character name cannot be empty')
    .max(100, 'Character name must be 100 characters or fewer')
    .optional(),
  sheetData: z.unknown().optional(),
});

export type CharacterCreateInput = z.infer<typeof characterCreateSchema>;
export type CharacterUpdateInput = z.infer<typeof characterUpdateSchema>;

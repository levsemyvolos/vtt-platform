import { z } from 'zod';
import { characterSheetSchema } from './character_5e.schema';

/** DB: Character.name VarChar(128) */
export const characterCreateSchema = z.object({
  name: z
    .string({ required_error: 'Character name is required' })
    .trim()
    .min(1, 'Character name cannot be empty')
    .max(64, 'Character name must be 64 characters or fewer'),
  sheetData: z.union([characterSheetSchema, z.record(z.unknown())]).optional(),
  // tolerates legacy/unknown shapes; structured sheets validated by characterSheetSchema
});

export const characterUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Character name cannot be empty')
    .max(64, 'Character name must be 64 characters or fewer')
    .optional(),
  sheetData: z.union([characterSheetSchema, z.record(z.unknown())]).optional(),
  // tolerates legacy/unknown shapes; structured sheets validated by characterSheetSchema
});

export type CharacterCreateInput = z.infer<typeof characterCreateSchema>;
export type CharacterUpdateInput = z.infer<typeof characterUpdateSchema>;

import { z } from 'zod';

/** DB: Note.title VarChar(128), Note.body Text */
export const noteCreateSchema = z.object({
  title: z
    .string({ required_error: 'Note title is required' })
    .trim()
    .min(1, 'Note title cannot be empty')
    .max(100, 'Note title must be 100 characters or fewer'),
  body: z
    .string()
    .max(50_000, 'Note body must be 50 000 characters or fewer')
    .default(''),
});

export const noteUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Note title cannot be empty')
    .max(100, 'Note title must be 100 characters or fewer')
    .optional(),
  body: z
    .string()
    .max(50_000, 'Note body must be 50 000 characters or fewer')
    .optional(),
});

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;

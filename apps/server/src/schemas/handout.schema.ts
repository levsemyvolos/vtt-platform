import { z } from 'zod';

/** DB: Handout.title VarChar(128), Handout.body Text */
export const handoutCreateSchema = z.object({
  title: z
    .string({ required_error: 'Handout title is required' })
    .trim()
    .min(1, 'Handout title cannot be empty')
    .max(100, 'Handout title must be 100 characters or fewer'),
  body: z
    .string()
    .max(50_000, 'Handout body must be 50 000 characters or fewer')
    .default(''),
  assetId: z.string().uuid().optional(),
});

export type HandoutCreateInput = z.infer<typeof handoutCreateSchema>;

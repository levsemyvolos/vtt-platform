import { z } from 'zod';

/** S10 — Journal entry create. */
export const journalCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(128, 'Title must be ≤ 128 chars'),
  body: z.string().max(50_000, 'Body must be ≤ 50000 chars'),
  assetId: z.string().uuid().optional(),
});

/** S10 — Journal entry update. `assetId: null` → clear; absent → keep. */
export const journalUpdateSchema = z.object({
  title: z.string().trim().min(1).max(128).optional(),
  body: z.string().max(50_000).optional(),
  assetId: z.union([z.string().uuid(), z.null()]).optional(),
});

/** S10 — Replace recipient list. Empty array = revoke (entry → private). */
export const journalGrantSchema = z.object({
  userIds: z.array(z.string().uuid()).max(100),
});

export type JournalCreateInput = z.infer<typeof journalCreateSchema>;
export type JournalUpdateInput = z.infer<typeof journalUpdateSchema>;
export type JournalGrantInput = z.infer<typeof journalGrantSchema>;

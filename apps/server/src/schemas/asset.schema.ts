import { z } from 'zod';

/**
 * Validation schema for POST /api/assets/uploads (init presigned upload).
 * Ф6.1, НФВ 6.2 — max size limits per asset kind.
 */
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const initUploadSchema = z.object({
  roomId: z.string().uuid('roomId must be a UUID'),
  mimeType: z.enum(IMAGE_MIMES, { errorMap: () => ({ message: 'mimeType must be image/png, image/jpeg, or image/webp' }) }),
  size: z
    .number({ required_error: 'size is required' })
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'Image size must not exceed 10 MB'),
});

export type InitUploadInput = z.infer<typeof initUploadSchema>;

/**
 * Validation schema for POST /api/assets (finalize after GCS PUT).
 */
export const finalizeUploadSchema = z.object({
  roomId: z.string().uuid('roomId must be a UUID'),
  storageKey: z
    .string()
    .min(1)
    .max(256)
    .regex(/^rooms\/[^/]+\//, 'storageKey must begin with rooms/<roomId>/'),
  mimeType: z.enum(IMAGE_MIMES),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

export type FinalizeUploadInput = z.infer<typeof finalizeUploadSchema>;

import { z } from 'zod';

export const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ALLOWED_AUDIO_MIMES = ['audio/mpeg', 'audio/ogg'] as const;
export const ALLOWED_DOC_MIMES = ['application/pdf'] as const;

export const ALLOWED_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_AUDIO_MIMES,
  ...ALLOWED_DOC_MIMES,
] as const;

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const uploadAssetSchema = z.object({
  roomId: z.string().uuid('roomId must be a UUID'),
});

export type UploadAssetInput = z.infer<typeof uploadAssetSchema>;

/**
 * Display-name validation for the rename UX.
 * Allowed: most printable chars including dots and spaces.
 * Denied: path separators (/, \), parent traversal (..), control chars, NULs.
 * Length 1–128 chars after trim — matches the Postgres VARCHAR(128) column.
 */
export const renameAssetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name is required')
    .max(128, 'name must be at most 128 chars')
    .refine((s) => !s.includes('/') && !s.includes('\\'), 'name cannot contain path separators')
    .refine((s) => !s.includes('..'), 'name cannot contain ..')
    // eslint-disable-next-line no-control-regex
    .refine((s) => !/[\x00-\x1f\x7f]/.test(s), 'name cannot contain control characters'),
});

export type RenameAssetInput = z.infer<typeof renameAssetSchema>;

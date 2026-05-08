import { z } from 'zod';

/** Audio routing layer — mirrors the `AudioLayer` Prisma enum and shared type. */
export const audioLayerEnum = z.enum(['music', 'ambient', 'sfx']);

export const audioFinalizeSchema = z.object({
  roomId: z.string().uuid('roomId must be a UUID'),
  storageKey: z.string().min(1),
  mimeType: z.enum(['audio/mpeg', 'audio/ogg', 'audio/wav']),
  size: z.number().int().positive(),
  title: z.string().trim().min(1).max(128),
  sceneId: z.string().uuid().nullable().optional(),
  loop: z.boolean().optional(),
  fadeMs: z.number().int().min(0).max(10000).optional(),
  layer: audioLayerEnum.optional(),
});

export const audioPatchSchema = z.object({
  sceneId: z.string().uuid().nullable().optional(),
  loop: z.boolean().optional(),
  title: z.string().trim().min(1).max(128).optional(),
  fadeMs: z.number().int().min(0).max(10000).optional(),
  layer: audioLayerEnum.optional(),
});

export type AudioFinalizeInput = z.infer<typeof audioFinalizeSchema>;
export type AudioPatchInput = z.infer<typeof audioPatchSchema>;

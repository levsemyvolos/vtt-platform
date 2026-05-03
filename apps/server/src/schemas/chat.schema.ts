import { z } from 'zod';

/** DB: ChatMessage.body Text */
export const chatMessageSchema = z.object({
  content: z
    .string({ required_error: 'Message content is required' })
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be 2000 characters or fewer'),
  mode: z
    .enum(['normal', 'ic', 'ooc', 'whisper', 'secret_roll'])
    .optional()
    .default('normal'),
  recipientId: z.string().uuid().optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

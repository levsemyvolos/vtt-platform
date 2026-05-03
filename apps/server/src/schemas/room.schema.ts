import { z } from 'zod';

/** DB: Room.name VarChar(128), Room.gameSystem VarChar(64) */
export const roomCreateSchema = z.object({
  name: z
    .string({ required_error: 'Room name is required' })
    .trim()
    .min(1, 'Room name cannot be empty')
    .max(100, 'Room name must be 100 characters or fewer'),
  gameSystem: z
    .string()
    .trim()
    .max(50, 'Game system must be 50 characters or fewer')
    .default('D&D 5e'),
});

export const roomUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Room name cannot be empty')
    .max(100, 'Room name must be 100 characters or fewer')
    .optional(),
  gameSystem: z
    .string()
    .trim()
    .max(50, 'Game system must be 50 characters or fewer')
    .optional(),
});

export type RoomCreateInput = z.infer<typeof roomCreateSchema>;
export type RoomUpdateInput = z.infer<typeof roomUpdateSchema>;

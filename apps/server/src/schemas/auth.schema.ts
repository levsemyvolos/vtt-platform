import { z } from 'zod';

/**
 * R2-REG-002 — Zod validation for /auth/register and /auth/login.
 *
 * Prevents:
 *  - 200-char password → bcrypt DoS (bcrypt truncates to 72 bytes but still
 *    allocates full 200-char buffer; max 72 aligns with bcrypt internal limit).
 *  - 200-char name → Prisma VARCHAR overflow → 500.
 *  - 300-char email → no DB maxLength enforced → 500 on Postgres constraint.
 */

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be 50 characters or fewer'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email format')
    .max(254, 'Email must be 254 characters or fewer'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer'),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email format')
    .max(254, 'Email must be 254 characters or fewer'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(72, 'Password must be 72 characters or fewer'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

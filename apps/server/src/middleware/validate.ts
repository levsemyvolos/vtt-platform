import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Express middleware factory that validates `req.body` against a Zod schema.
 *
 * On success: replaces `req.body` with the parsed (and trimmed) data and
 * calls `next()`.
 *
 * On failure: returns 400 VALIDATION_FAILED with flattened issue list.
 * This prevents raw DB errors (e.g. Postgres VARCHAR overflow → 500) from
 * reaching the client — closes BUG-004 (long room names → 500).
 */
export function validate<T extends ZodSchema>(schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Invalid request body',
        issues: result.error.flatten(),
      });
      return;
    }
    req.body = result.data as unknown;
    next();
  };
}

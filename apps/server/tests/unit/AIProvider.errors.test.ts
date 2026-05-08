import { describe, it, expect } from 'vitest';
import { handleError } from '../../src/routes/ai.js';
import {
  AIQuotaError,
  AISafetyError,
  AIInvalidPromptError,
  AINetworkError,
} from '../../src/infrastructure/ai/AIProvider.js';
import type { Response } from 'express';

function makeMockRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status: (code: number) => { statusCode = code; return res; },
    json: (b: unknown) => { body = b; return res; },
  };
  return { res: res as unknown as Response, getStatus: () => statusCode, getBody: () => body };
}

describe('handleError (Session 1.2)', () => {
  const cases: Array<{ err: Error; status: number; kind: string }> = [
    { err: new AIQuotaError(), status: 503, kind: 'ai_quota' },
    { err: new AISafetyError(), status: 422, kind: 'ai_safety' },
    { err: new AIInvalidPromptError(), status: 400, kind: 'ai_invalid_prompt' },
    { err: new AINetworkError(), status: 504, kind: 'ai_network' },
    { err: new Error('boom'), status: 500, kind: 'ai_unknown' },
  ];

  for (const c of cases) {
    it(`maps ${c.err.constructor.name} → ${c.status} ${c.kind}`, () => {
      const { res, getStatus, getBody } = makeMockRes();
      handleError(c.err, res);
      expect(getStatus()).toBe(c.status);
      expect((getBody() as { error: { kind: string } }).error.kind).toBe(c.kind);
    });
  }
});

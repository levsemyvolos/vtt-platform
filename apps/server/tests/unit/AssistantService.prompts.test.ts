import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { SYSTEM_PROMPTS_VERSION } from '../../src/services/AssistantService.js';

/**
 * Rubric-based regression tests for SYSTEM_PROMPTS (v2.0.0+).
 *
 * Asserts on STRUCTURE (rules, headings, language directive) rather than exact
 * substrings — keeps suite less brittle across future prompt iterations.
 *
 * Prompts under test live as private const inside AssistantService.ts; this file
 * extracts them via mocked AIProvider call-capture, so we exercise the same code
 * path that real generation uses.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSISTANT_SVC_SRC = resolve(__dirname, '../../src/services/AssistantService.ts');

interface CapturedReq { system: string; history: ReadonlyArray<{ role: string; content: string }>; user: string }

async function capture(context: 'npc-description' | 'scene-description' | 'srd-lookup' | 'free-chat'): Promise<string> {
  // S6.1 role-split: provider receives { system, history, user } object instead of flat string.
  // We concatenate them back into a single string so existing rubric tests that use
  // .toContain remain valid for the prompt CONTENT (which is what the rubric tests).
  const calls: CapturedReq[] = [];
  const provider = {
    generateText: async (req: CapturedReq) => { calls.push(req); return 'mock'; },
    generateImage: async () => ({}),
    generateMusic: async () => ({}),
  };
  const { AssistantService } = await import('../../src/services/AssistantService.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new AssistantService(provider as any);
  await svc.generateAssistantText({ context, userPrompt: 'TEST_PROMPT' });
  const r = calls[0];
  if (!r) return '';
  return `${r.system}\n\nUser: ${r.user}`;
}

describe('SYSTEM_PROMPTS v2.1.0 — version + module surface', () => {
  it('exports SYSTEM_PROMPTS_VERSION === "2.1.0"', () => {
    expect(SYSTEM_PROMPTS_VERSION).toBe('2.1.0');
  });

  it('module source contains version-header comment block', () => {
    const src = readFileSync(ASSISTANT_SVC_SRC, 'utf-8');
    expect(src).toContain('SYSTEM_PROMPTS — v2.1.0');
    expect(src).toContain('Updated: 2026-05-09');
  });
});

describe('SYSTEM_PROMPTS v2.0.0 — npc-description rubric', () => {
  it('ends with Ukrainian language directive', async () => {
    const prompt = await capture('npc-description');
    expect(prompt).toMatch(/Respond in Ukrainian\./);
  });

  it('contains all 7 numbered RULES (incl. DEFAULT SYSTEM + LICENSE-BOUNDED, S3.0)', async () => {
    const prompt = await capture('npc-description');
    expect(prompt).toContain('1. ONE VERBAL MANNERISM');
    expect(prompt).toContain('2. ONE PHYSICAL MANNERISM');
    expect(prompt).toContain('3. CONTRADICTION ENGINE');
    expect(prompt).toContain('4. ACTIONABLE SECRET');
    expect(prompt).toContain('5. MECHANICAL STATBLOCK');
    expect(prompt).toContain('6. DEFAULT SYSTEM');
    expect(prompt).toContain('7. LICENSE-BOUNDED STATBLOCK');
  });

  it('OUTPUT FORMAT contains all 9 Ukrainian section headings', async () => {
    const prompt = await capture('npc-description');
    for (const heading of [
      '**Зовнішність:**',
      '**Вербальна манера:**',
      '**Фізична манера:**',
      '**Мотивація:**',
      '**Контрадикція:**',
      '**Таємниця / Гачок:**',
      '**Зразок діалогу:**',
      '**Statblock',
      '**Припущення:**',
    ]) {
      expect(prompt).toContain(heading);
    }
  });
});

describe('SYSTEM_PROMPTS v2.0.0 — scene-description rubric', () => {
  it('ends with Ukrainian language directive', async () => {
    const prompt = await capture('scene-description');
    expect(prompt).toMatch(/Respond in Ukrainian\./);
  });

  it('contains all 5 numbered RULES (incl. ≤900 chars constraint)', async () => {
    const prompt = await capture('scene-description');
    expect(prompt).toContain('1. FIVE SENSES MANDATE');
    expect(prompt).toContain('2. SHOW, DON\'T TELL');
    expect(prompt).toContain('3. CONSTANTS AND EXCEPTIONS');
    expect(prompt).toContain('4. INTERACTIVE FEATURES');
    expect(prompt).toContain('5. STRICT TWO-PART OUTPUT');
    expect(prompt).toContain('900 characters');
  });

  it('OUTPUT FORMAT contains both READ-ALOUD and GM NOTES dividers + UK GM bullets', async () => {
    const prompt = await capture('scene-description');
    expect(prompt).toContain('--- READ-ALOUD (≤900 characters');
    expect(prompt).toContain('--- GM NOTES ---');
    expect(prompt).toContain('Приховані елементи:');
    expect(prompt).toContain('Інтерактивні об\'єкти:');
    expect(prompt).toContain('Перевірки навичок:');
  });
});

describe('SYSTEM_PROMPTS v2.0.0 — srd-lookup rubric', () => {
  it('ends with Ukrainian language directive', async () => {
    const prompt = await capture('srd-lookup');
    expect(prompt).toMatch(/Respond in Ukrainian\./);
  });

  it('contains all 8 HARD CONSTRAINTS (incl. license-bounded rule 8, S3.0)', async () => {
    const prompt = await capture('srd-lookup');
    expect(prompt).toContain('1. BASE ALL RULINGS EXCLUSIVELY');
    expect(prompt).toContain('2. "I DO NOT KNOW" PROTOCOL');
    expect(prompt).toContain('3. MANDATORY CITATION');
    expect(prompt).toContain('4. CHAIN-OF-THOUGHT REASONING');
    expect(prompt).toContain('5. CROSS-SYSTEM LOCK');
    expect(prompt).toContain('6. DEFAULT SYSTEM');
    expect(prompt).toContain('7. SESSION-CONTEXT CONFLICT');
    expect(prompt).toContain('8. LICENSE-BOUNDED SCOPE');
  });

  it('OUTPUT FORMAT contains 4 Ukrainian section headings', async () => {
    const prompt = await capture('srd-lookup');
    for (const heading of [
      '**Пряма відповідь:**',
      '**Підстава у SRD:**',
      '**Граничні випадки:**',
      '**Варіанти house rule:**',
    ]) {
      expect(prompt).toContain(heading);
    }
  });
});

describe('SYSTEM_PROMPTS v2.0.0 — free-chat rubric', () => {
  it('ends with Ukrainian language directive', async () => {
    const prompt = await capture('free-chat');
    expect(prompt).toMatch(/Respond in Ukrainian\./);
  });

  it('contains all 5 numbered RULES', async () => {
    const prompt = await capture('free-chat');
    expect(prompt).toContain('1. RAPID CONSUMPTION FORMAT');
    expect(prompt).toContain('2. SPECTRUM OF IDEAS');
    expect(prompt).toContain('3. THEMATIC CONSISTENCY');
    expect(prompt).toContain('4. ACTION-ORIENTED DESIGN');
    expect(prompt).toMatch(/^5\. /m);
  });

  it('SPECTRUM tier markers present (STANDARD / SUBVERSION / WILDCARD)', async () => {
    const prompt = await capture('free-chat');
    expect(prompt).toContain('STANDARD:');
    expect(prompt).toContain('SUBVERSION:');
    expect(prompt).toContain('WILDCARD:');
  });
});

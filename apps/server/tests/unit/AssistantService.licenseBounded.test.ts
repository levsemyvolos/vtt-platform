import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPTS } from '../../src/services/AssistantService.js';

/**
 * License-bounded scope hard refusal tests.
 *
 * These tests pin the verbatim refusal-string and the rule numbering in the
 * NPC and SRD system prompts. Manual A/B (honeypot corpus in
 * `scratch/honeypot_corpus.md`) validates that the model actually fires the
 * refusal in production — unit-tests here only guard the prompt structure.
 *
 * Background — STRIDE T-NEW «Copyright leak via model memory»:
 *   LLM training data contains closed rulebooks (D&D 2024 PHB, Tasha's,
 *   Mothership 1e, etc.). Without a hard refusal clause the model would
 *   recall and paraphrase those mechanics on demand. The refusal-string
 *   forbids paraphrase + training-data recall + value-invention explicitly.
 */

const REFUSAL_VERBATIM = 'Це не входить у відкриту ліцензію {Ruleset}; зверніться до офіційного rulebook.';

describe('SYSTEM_PROMPTS — license-bounded refusal (npc-description)', () => {
  const prompt = SYSTEM_PROMPTS['npc-description'];

  it('rule 7 LICENSE-BOUNDED STATBLOCK is numbered and present', () => {
    expect(prompt).toContain('7. LICENSE-BOUNDED STATBLOCK');
  });

  it('contains the verbatim refusal string with {Ruleset} placeholder', () => {
    expect(prompt).toContain(REFUSAL_VERBATIM);
  });

  it('explicitly forbids training-data recall + paraphrase + invention', () => {
    expect(prompt).toMatch(/MUST NOT recall those mechanics from training data/);
    expect(prompt).toMatch(/paraphrase them/);
    expect(prompt).toMatch(/invent plausible substitutes/);
  });

  it('enumerates the 4 open-license corpora explicitly', () => {
    expect(prompt).toContain('CC-BY 4.0 SRD 5.1');
    expect(prompt).toContain('ORC for Pathfinder 2e');
    expect(prompt).toContain('CC-BY-SA for Cairn 2e');
    expect(prompt).toContain('CC-BY 3.0 for Dungeon World');
  });

  it('names key closed-rulebook examples to anchor refusal', () => {
    expect(prompt).toMatch(/2024 PHB exclusive/);
    expect(prompt).toMatch(/Tasha's|Xanathar's/);
    expect(prompt).toMatch(/Echo Knight/);
    expect(prompt).toMatch(/Mothership 1e|Call of Cthulhu 7e/);
  });
});

describe('SYSTEM_PROMPTS — license-bounded refusal (srd-lookup)', () => {
  const prompt = SYSTEM_PROMPTS['srd-lookup'];

  it('rule 8 LICENSE-BOUNDED SCOPE is numbered and present', () => {
    expect(prompt).toContain('8. LICENSE-BOUNDED SCOPE');
  });

  it('contains the verbatim refusal string in the Direct-Answer slot', () => {
    expect(prompt).toContain(REFUSAL_VERBATIM);
    // Must instruct model to put refusal in Пряма відповідь (Direct Answer) slot
    expect(prompt).toMatch(/\*\*Пряма відповідь\*\*[\s\S]{0,80}EXACTLY/);
  });

  it('explicitly forbids paraphrase + training-data recall + value invention', () => {
    expect(prompt).toMatch(/Do NOT paraphrase the rule/);
    expect(prompt).toMatch(/do NOT recall it from training data/);
    expect(prompt).toMatch(/do NOT invent values/);
    expect(prompt).toMatch(/do NOT generate plausible substitutes/);
  });

  it('coexists with rule 2 "I DO NOT KNOW" — distinct refusal mechanisms', () => {
    expect(prompt).toContain('2. "I DO NOT KNOW" PROTOCOL');
    expect(prompt).toContain('SRD не надає явного правила для цього сценарію.');
    // Two refusal-strings — one for in-scope ambiguity, one for out-of-scope-by-design.
    expect(prompt).not.toBe(REFUSAL_VERBATIM);
  });
});

describe('SYSTEM_PROMPTS — terminology normalisation (2014 SRD → SRD 5.1)', () => {
  it('npc-description uses "D&D 5e (SRD 5.1)" terminology, not "2014 SRD"', () => {
    expect(SYSTEM_PROMPTS['npc-description']).toContain('D&D 5e (SRD 5.1)');
    expect(SYSTEM_PROMPTS['npc-description']).not.toContain('D&D 5e (2014 SRD)');
  });

  it('srd-lookup uses "D&D 5e (SRD 5.1)" terminology, not "2014 SRD"', () => {
    expect(SYSTEM_PROMPTS['srd-lookup']).toContain('D&D 5e (SRD 5.1)');
    expect(SYSTEM_PROMPTS['srd-lookup']).not.toContain('D&D 5e (2014 SRD)');
  });
});

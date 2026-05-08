import { randomInt } from 'crypto';
import type { DiceMode } from '@vtt/shared';

/**
 * Algorithm A1 — parser of dice formulas + cryptographically-strong RNG.
 *
 * EBNF grammar (§2.17.2):
 *   formula  = dice (modifier)?
 *   dice     = count "d" faces
 *   modifier = ("+" | "-") integer
 *   count    = integer (1..100)
 *   faces    = integer (2..1000)
 *
 * Invariant: Math.random is NEVER called — only crypto.randomInt (НФВ 4.2).
 * The eslint rule `no-restricted-globals` (Math) enforces this at lint time.
 */

export interface DiceFormula {
  count: number;
  faces: number;
  modifier: number;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface DiceRollResult {
  expression: string;
  formula: DiceFormula;
  rolls: number[];
  total: number;
  mode: DiceMode;
}

const MAX_COUNT = 100;
const MAX_FACES = 1000;

const FORMULA_RE = /^\s*(\d+)\s*[dD]\s*(\d+)\s*([+-]\s*\d+)?\s*$/;

function validateRange(
  value: number,
  min: number,
  max: number,
  label: string,
): string | null {
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${label} must be between ${min} and ${max}`;
  }
  return null;
}

export class DiceService {
  /**
   * Parses a textual dice formula like "2d6+3" or "1d20-1" into a structured form.
   * Pure function — does not roll.
   * @param expression user input
   */
  parse(expression: string): ParseResult<DiceFormula> {
    const m = FORMULA_RE.exec(expression);
    if (!m) return { ok: false, error: 'Invalid dice expression' };

    const count = Number.parseInt(m[1] ?? '', 10);
    const faces = Number.parseInt(m[2] ?? '', 10);
    const rawMod = m[3];
    const modifier =
      rawMod !== undefined ? Number.parseInt(rawMod.replace(/\s+/g, ''), 10) : 0;

    const errCount = validateRange(count, 1, MAX_COUNT, 'Dice count');
    if (errCount) return { ok: false, error: errCount };
    const errFaces = validateRange(faces, 2, MAX_FACES, 'Dice faces');
    if (errFaces) return { ok: false, error: errFaces };
    if (!Number.isFinite(modifier)) {
      return { ok: false, error: 'Modifier is not a finite integer' };
    }

    return { ok: true, value: { count, faces, modifier } };
  }

  /**
   * Rolls the parsed formula under the given dice mode. Uses crypto.randomInt
   * (uniform integer in [1..faces], inclusive on both ends).
   *
   * Modes per §2.17.2:
   * - normal:        roll `count` dice, sum.
   * - advantage:     roll the formula twice, take the result with the larger sum.
   * - disadvantage:  roll the formula twice, take the result with the smaller sum.
   */
  rollFormula(formula: DiceFormula, mode: DiceMode): { rolls: number[]; total: number } {
    const oneTrial = (): { rolls: number[]; total: number } => {
      const rolls: number[] = [];
      let sum = 0;
      for (let i = 0; i < formula.count; i++) {
        const r = randomInt(1, formula.faces + 1);
        rolls.push(r);
        sum += r;
      }
      return { rolls, total: sum + formula.modifier };
    };

    if (mode === 'advantage' || mode === 'disadvantage') {
      const a = oneTrial();
      const b = oneTrial();
      const pickA =
        mode === 'advantage' ? a.total >= b.total : a.total <= b.total;
      return pickA ? a : b;
    }
    return oneTrial();
  }

  /**
   * High-level convenience: parse + roll. Returns a structured result or a
   * parse error wrapped in a ParseResult so callers can branch cleanly.
   */
  parseAndRoll(expression: string, mode: DiceMode): ParseResult<DiceRollResult> {
    const parsed = this.parse(expression);
    if (!parsed.ok) return parsed;
    const { rolls, total } = this.rollFormula(parsed.value, mode);
    return {
      ok: true,
      value: {
        expression,
        formula: parsed.value,
        rolls,
        total,
        mode,
      },
    };
  }
}

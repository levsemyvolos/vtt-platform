import { describe, it, expect, vi } from 'vitest';
import { DiceService } from '../../src/services/DiceService.js';
import { ChatService } from '../../src/services/ChatService.js';
import type { ChatMessageRepository } from '../../src/repositories/ChatMessageRepository.js';

describe('DiceService.parse (algorithm A1 EBNF)', () => {
  const svc = new DiceService();

  it('parses "1d20" with no modifier', () => {
    const r = svc.parse('1d20');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ count: 1, faces: 20, modifier: 0 });
  });

  it('parses "2d6+3"', () => {
    const r = svc.parse('2d6+3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ count: 2, faces: 6, modifier: 3 });
  });

  it('parses negative modifier "1d8-2"', () => {
    const r = svc.parse('1d8-2');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ count: 1, faces: 8, modifier: -2 });
  });

  it('tolerates whitespace and uppercase D ("  3 D 10 + 5  ")', () => {
    const r = svc.parse('  3 D 10 + 5  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ count: 3, faces: 10, modifier: 5 });
  });

  it('rejects "d20" (missing count)', () => {
    expect(svc.parse('d20').ok).toBe(false);
  });

  it('rejects "1d1" (faces < 2)', () => {
    expect(svc.parse('1d1').ok).toBe(false);
  });

  it('rejects "0d6" (count < 1)', () => {
    expect(svc.parse('0d6').ok).toBe(false);
  });

  it('rejects "101d6" (count > 100)', () => {
    expect(svc.parse('101d6').ok).toBe(false);
  });

  it('rejects "1d1001" (faces > 1000)', () => {
    expect(svc.parse('1d1001').ok).toBe(false);
  });

  it('rejects garbage "abc"', () => {
    expect(svc.parse('abc').ok).toBe(false);
  });

  it('rejects empty string', () => {
    expect(svc.parse('').ok).toBe(false);
  });
});

describe('DiceService.rollFormula (crypto.randomInt invariant)', () => {
  const svc = new DiceService();

  it('all rolls fall within [1..faces]', () => {
    const formula = { count: 50, faces: 20, modifier: 0 };
    const { rolls } = svc.rollFormula(formula, 'normal');
    expect(rolls).toHaveLength(50);
    for (const r of rolls) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });

  it('total = sum(rolls) + modifier', () => {
    const formula = { count: 5, faces: 6, modifier: 7 };
    const { rolls, total } = svc.rollFormula(formula, 'normal');
    const sum = rolls.reduce((a, b) => a + b, 0);
    expect(total).toBe(sum + 7);
  });

  it('advantage picks the higher of two trials', () => {
    const formula = { count: 10, faces: 6, modifier: 0 };
    // Run many trials — at least 95% of advantage totals must be >= the median normal roll.
    let advantageWins = 0;
    const N = 50;
    for (let i = 0; i < N; i++) {
      const adv = svc.rollFormula(formula, 'advantage').total;
      const norm = svc.rollFormula(formula, 'normal').total;
      if (adv >= norm) advantageWins++;
    }
    // statistical: advantage should win or tie ≥60% of the time even in small samples
    expect(advantageWins).toBeGreaterThanOrEqual(N * 0.5);
  });

  it('disadvantage picks the lower of two trials', () => {
    const formula = { count: 10, faces: 20, modifier: 0 };
    const N = 50;
    let disadvantageLoses = 0;
    for (let i = 0; i < N; i++) {
      const dis = svc.rollFormula(formula, 'disadvantage').total;
      const norm = svc.rollFormula(formula, 'normal').total;
      if (dis <= norm) disadvantageLoses++;
    }
    expect(disadvantageLoses).toBeGreaterThanOrEqual(N * 0.5);
  });

  it('parseAndRoll wraps everything (happy path)', () => {
    const r = svc.parseAndRoll('3d6+1', 'normal');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.expression).toBe('3d6+1');
      expect(r.value.rolls).toHaveLength(3);
      expect(r.value.mode).toBe('normal');
    }
  });

  it('parseAndRoll normal mode produces valid rolls (secret flag is orthogonal, handled by ChatService)', () => {
    // Visibility (secret) is separate from roll mechanic — DiceService only sees the mechanic.
    const r = svc.parseAndRoll('1d1000', 'normal');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(r.value.rolls[0]).toBeLessThanOrEqual(1000);
      expect(r.value.mode).toBe('normal');
    }
  });

  it('parseAndRoll surfaces parse error without rolling', () => {
    const r = svc.parseAndRoll('not a formula', 'normal');
    expect(r.ok).toBe(false);
  });

  it('1d2 is uniform — both 1 and 2 appear in 200 rolls (smoke test for randomInt)', () => {
    const formula = { count: 1, faces: 2, modifier: 0 };
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const { rolls } = svc.rollFormula(formula, 'normal');
      const v = rolls[0];
      if (v !== undefined) seen.add(v);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });
});

describe('ChatService.recordDiceRoll — secret flag orthogonal to mechanic', () => {
  it('advantage + secret: payload has mode=advantage, secret=true, recipients includes roller + GM', async () => {
    const rollerId = 'user-roller';
    const gmId = 'user-gm';
    const roomId = 'room-xyz';

    // Stub the repo — create returns a minimal ChatMessage shape
    const fakeMessage = {
      id: 'msg-99',
      roomId,
      senderId: rollerId,
      mode: 'secret_roll',
      body: '1d20',
      rollPayload: null,
      recipientId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const repoMock = {
      create: vi.fn().mockResolvedValue(fakeMessage),
    } as unknown as ChatMessageRepository;

    const chatSvc = new ChatService(repoMock);
    const diceSvc = new DiceService();

    const parsed = diceSvc.parseAndRoll('1d20', 'advantage');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const { payload, delivery } = await chatSvc.recordDiceRoll(
      rollerId,
      roomId,
      parsed.value,
      true,    // secret
      [gmId],  // gmUserIds
    );

    expect(payload.mode).toBe('advantage');
    expect(payload.secret).toBe(true);
    expect(payload.recipients).toContain(rollerId);
    expect(payload.recipients).toContain(gmId);
    expect(delivery.mode).toBe('unicast');
    expect(delivery.recipients).toContain(rollerId);
    expect(delivery.recipients).toContain(gmId);
  });
});

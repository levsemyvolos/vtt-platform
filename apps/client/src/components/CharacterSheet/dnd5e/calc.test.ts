import { describe, it, expect } from 'vitest';
import { makeEmpty5eSheet } from '@vtt/shared';
import {
  abilityMod,
  proficiencyBonus,
  saveModFor,
  skillModFor,
  passivePerception,
  spellSaveDc,
  spellAttackBonus,
  initiativeMod,
  formatMod,
} from './calc';

// ---------------------------------------------------------------------------
// abilityMod
// ---------------------------------------------------------------------------
describe('abilityMod', () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [18, 4],
    [20, 5],
    [30, 10],
  ])('score %i → %i', (score, expected) => {
    expect(abilityMod(score)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// proficiencyBonus
// ---------------------------------------------------------------------------
describe('proficiencyBonus', () => {
  it.each([
    [undefined, 2],
    [null, 2],
    [0, 2],  // clamped to 1
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
    [25, 6],  // clamped to 20
  ] as [number | null | undefined, number][])(
    'level %s → %i',
    (level, expected) => {
      expect(proficiencyBonus(level)).toBe(expected);
    },
  );
});

// ---------------------------------------------------------------------------
// saveModFor
// ---------------------------------------------------------------------------
describe('saveModFor', () => {
  it('STR proficient at level 5 with STR=14 → +5', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.STR = 14;   // mod = +2
    sheet.saveProfs.STR = true;
    sheet.identity.level = 5;  // prof = +3
    expect(saveModFor(sheet, 'STR')).toBe(5);
  });

  it('DEX not proficient at level 5 with DEX=16 → +3', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.DEX = 16;  // mod = +3
    sheet.saveProfs.DEX = false;
    sheet.identity.level = 5;
    expect(saveModFor(sheet, 'DEX')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// skillModFor
// ---------------------------------------------------------------------------
describe('skillModFor', () => {
  it('none: STR=14 athletics "none" lvl 1 → +2', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.STR = 14;
    sheet.skills.athletics = 'none';
    sheet.identity.level = 1;
    expect(skillModFor(sheet, 'athletics')).toBe(2);
  });

  it('proficient: STR=14 athletics "proficient" lvl 5 → +5', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.STR = 14;
    sheet.skills.athletics = 'proficient';
    sheet.identity.level = 5;
    expect(skillModFor(sheet, 'athletics')).toBe(5);
  });

  it('expertise: DEX=16 stealth "expertise" lvl 5 → +9', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.DEX = 16;
    sheet.skills.stealth = 'expertise';
    sheet.identity.level = 5;  // prof = +3, expertise = +6
    expect(skillModFor(sheet, 'stealth')).toBe(9);
  });

  it('tolerates missing key as "none"', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.INT = 14;
    // Cast to bypass type to simulate runtime missing key
    (sheet.skills as Record<string, unknown>)['arcana'] = undefined;
    sheet.identity.level = 1;
    expect(skillModFor(sheet, 'arcana')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// passivePerception
// ---------------------------------------------------------------------------
describe('passivePerception', () => {
  it('WIS=14 perception "proficient" lvl 5 → 15', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.WIS = 14;  // mod = +2
    sheet.skills.perception = 'proficient';
    sheet.identity.level = 5;  // prof = +3 → 10+2+3 = 15
    expect(passivePerception(sheet)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// spellSaveDc
// ---------------------------------------------------------------------------
describe('spellSaveDc', () => {
  it('spellAbility=null → null', () => {
    const sheet = makeEmpty5eSheet();
    sheet.spellcasting.spellAbility = null;
    expect(spellSaveDc(sheet)).toBeNull();
  });

  it('spellAbility not set (default) → null', () => {
    const sheet = makeEmpty5eSheet();
    // spellAbility is not set in makeEmpty5eSheet; the field is optional so it is undefined
    // We delete the key to simulate a missing field without triggering exactOptionalPropertyTypes
    delete (sheet.spellcasting as { spellAbility?: unknown }).spellAbility;
    expect(spellSaveDc(sheet)).toBeNull();
  });

  it('INT=18 lvl 5 → 8+3+4 = 15', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.INT = 18;
    sheet.spellcasting.spellAbility = 'INT';
    sheet.identity.level = 5;
    expect(spellSaveDc(sheet)).toBe(15);
  });

  it('saveDcOverride=20 → 20 regardless of stats', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.INT = 18;
    sheet.spellcasting.spellAbility = 'INT';
    sheet.identity.level = 5;
    sheet.spellcasting.saveDcOverride = 20;
    expect(spellSaveDc(sheet)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// spellAttackBonus
// ---------------------------------------------------------------------------
describe('spellAttackBonus', () => {
  it('spellAbility=null → null', () => {
    const sheet = makeEmpty5eSheet();
    sheet.spellcasting.spellAbility = null;
    expect(spellAttackBonus(sheet)).toBeNull();
  });

  it('INT=18 lvl 5 → 3+4 = 7', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.INT = 18;
    sheet.spellcasting.spellAbility = 'INT';
    sheet.identity.level = 5;
    expect(spellAttackBonus(sheet)).toBe(7);
  });

  it('attackBonusOverride=10 → 10', () => {
    const sheet = makeEmpty5eSheet();
    sheet.spellcasting.spellAbility = 'WIS';
    sheet.spellcasting.attackBonusOverride = 10;
    expect(spellAttackBonus(sheet)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// initiativeMod
// ---------------------------------------------------------------------------
describe('initiativeMod', () => {
  it('DEX=14 no override → +2', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.DEX = 14;
    expect(initiativeMod(sheet)).toBe(2);
  });

  it('initiativeOverride=5 → 5 regardless of DEX', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.DEX = 14;
    sheet.vitals.initiativeOverride = 5;
    expect(initiativeMod(sheet)).toBe(5);
  });

  it('initiativeOverride=0 is respected (not falsy-skipped)', () => {
    const sheet = makeEmpty5eSheet();
    sheet.abilities.DEX = 14;
    sheet.vitals.initiativeOverride = 0;
    expect(initiativeMod(sheet)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatMod
// ---------------------------------------------------------------------------
describe('formatMod', () => {
  it.each([
    [0, '0'],
    [3, '+3'],
    [-2, '-2'],
    [10, '+10'],
    [-5, '-5'],
  ])('mod %i → "%s"', (mod, expected) => {
    expect(formatMod(mod)).toBe(expected);
  });
});

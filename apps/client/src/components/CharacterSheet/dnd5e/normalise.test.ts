import { describe, it, expect } from 'vitest';
import { normalise5eSheet, normaliseCharacterSheet, normaliseVitalsBlock } from './normalise';
import { makeEmpty5eSheet } from '@vtt/shared';

describe('normalise5eSheet', () => {
  // -------------------------------------------------------------------------
  // Empty / null / undefined / garbage inputs
  // -------------------------------------------------------------------------
  it('returns empty sheet for null', () => {
    const result = normalise5eSheet(null);
    expect(result.kind).toBe('5e');
    expect(result.abilities.STR).toBe(10);
    expect(result.spellcasting.slots).toHaveLength(9);
  });

  it('returns empty sheet for undefined', () => {
    const result = normalise5eSheet(undefined);
    expect(result.kind).toBe('5e');
  });

  it('returns empty sheet for empty object {}', () => {
    const result = normalise5eSheet({});
    expect(result.kind).toBe('5e');
    expect(result.abilities.DEX).toBe(10);
    expect(result.attacks).toEqual([]);
    expect(result.spells).toEqual([]);
  });

  it('returns empty sheet for a string', () => {
    const result = normalise5eSheet('garbage');
    expect(result.kind).toBe('5e');
  });

  it('returns empty sheet for an array', () => {
    const result = normalise5eSheet([1, 2, 3]);
    expect(result.kind).toBe('5e');
  });

  // -------------------------------------------------------------------------
  // New shape passthrough
  // -------------------------------------------------------------------------
  it('passes through a valid Sheet5e unchanged', () => {
    const valid = makeEmpty5eSheet();
    valid.identity.className = 'Wizard';
    valid.abilities.INT = 18;
    valid.skills.arcana = 'proficient';
    const result = normalise5eSheet(valid);
    expect(result.kind).toBe('5e');
    expect(result.identity.className).toBe('Wizard');
    expect(result.abilities.INT).toBe(18);
    expect(result.skills.arcana).toBe('proficient');
  });

  it('fills holes in a partial Sheet5e', () => {
    const partial = { kind: '5e', abilities: { STR: 15 } };
    const result = normalise5eSheet(partial);
    expect(result.kind).toBe('5e');
    expect(result.abilities.STR).toBe(15);
    // Missing abilities get defaults
    expect(result.abilities.DEX).toBe(10);
    expect(result.spellcasting.slots).toHaveLength(9);
  });

  it('always provides 9 spell slots', () => {
    // New shape with too few slots
    const withFewSlots = {
      kind: '5e',
      spellcasting: { slots: [{ current: 2, max: 3 }] },
    };
    const result = normalise5eSheet(withFewSlots);
    expect(result.spellcasting.slots).toHaveLength(9);
    expect(result.spellcasting.slots[0]).toEqual({ current: 2, max: 3 });
    expect(result.spellcasting.slots[1]).toEqual({ current: 0, max: 0 });
  });

  it('truncates extra slots to 9', () => {
    const tooMany = {
      kind: '5e',
      spellcasting: {
        slots: Array.from({ length: 12 }, (_, i) => ({ current: i, max: i })),
      },
    };
    const result = normalise5eSheet(tooMany);
    expect(result.spellcasting.slots).toHaveLength(9);
  });

  it('clamps ability scores to [1, 30]', () => {
    const outOfRange = { kind: '5e', abilities: { STR: 0, DEX: 99 } };
    const result = normalise5eSheet(outOfRange);
    expect(result.abilities.STR).toBe(1);
    expect(result.abilities.DEX).toBe(30);
  });

  it('passes through skill proficiency tiers', () => {
    const sheet = {
      kind: '5e',
      skills: { acrobatics: 'expertise', stealth: 'proficient', perception: 'none' },
    };
    const result = normalise5eSheet(sheet);
    expect(result.skills.acrobatics).toBe('expertise');
    expect(result.skills.stealth).toBe('proficient');
    expect(result.skills.perception).toBe('none');
  });

  it('ignores invalid skill tier values', () => {
    const sheet = { kind: '5e', skills: { acrobatics: 'superPro' } };
    const result = normalise5eSheet(sheet);
    expect(result.skills.acrobatics).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Legacy shape migration
  // -------------------------------------------------------------------------
  it('migrates legacy shape with all fields', () => {
    const legacy = {
      attributes: { STR: 16, DEX: 14, CON: 12, INT: 8, WIS: 10, CHA: 11 },
      hp: 28,
      maxHp: 32,
      ac: 15,
      speed: 30,
      skills: [
        { name: 'Acrobatics', proficient: true },
        { name: 'Athletics', proficient: false },
        { name: 'Perception', proficient: true },
      ],
      inventory: ['Longsword', 'Shield', 'Backpack'],
      spells: [{ name: 'Magic Missile', level: 1, description: 'Three darts.' }],
    };
    const result = normalise5eSheet(legacy);
    expect(result.kind).toBe('5e');
    expect(result.abilities.STR).toBe(16);
    expect(result.abilities.DEX).toBe(14);
    expect(result.vitals.hp).toBe(28);
    expect(result.vitals.maxHp).toBe(32);
    expect(result.vitals.ac).toBe(15);
    expect(result.vitals.speed).toBe(30);
    // Inventory → equipment string
    expect(result.equipment).toBe('Longsword\nShield\nBackpack');
    // Spells pass through
    expect(result.spells).toHaveLength(1);
    expect(result.spells[0]?.name).toBe('Magic Missile');
  });

  it('maps legacy Acrobatics proficient:true → skills.acrobatics === proficient', () => {
    const legacy = {
      skills: [{ name: 'Acrobatics', proficient: true }],
    };
    const result = normalise5eSheet(legacy);
    expect(result.skills.acrobatics).toBe('proficient');
  });

  it('maps legacy Acrobatics proficient:false → skills.acrobatics === none', () => {
    const legacy = {
      skills: [{ name: 'Acrobatics', proficient: false }],
    };
    const result = normalise5eSheet(legacy);
    expect(result.skills.acrobatics).toBe('none');
  });

  it('maps legacy "Sleight of Hand" → sleightOfHand', () => {
    const legacy = {
      skills: [{ name: 'Sleight of Hand', proficient: true }],
    };
    const result = normalise5eSheet(legacy);
    expect(result.skills.sleightOfHand).toBe('proficient');
  });

  it('maps legacy "Animal Handling" → animalHandling', () => {
    const legacy = {
      skills: [{ name: 'Animal Handling', proficient: true }],
    };
    const result = normalise5eSheet(legacy);
    expect(result.skills.animalHandling).toBe('proficient');
  });

  it('drops unknown legacy skill names silently', () => {
    const legacy = {
      skills: [{ name: 'Unicycle Riding', proficient: true }],
    };
    const result = normalise5eSheet(legacy);
    // No crash; all skills default to 'none'
    expect(result.skills.acrobatics).toBe('none');
  });

  it('handles legacy with no inventory (undefined) → equipment undefined', () => {
    const legacy = { attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } };
    const result = normalise5eSheet(legacy);
    expect(result.equipment).toBeUndefined();
  });

  it('handles legacy with empty inventory → empty string', () => {
    const legacy = { inventory: [] };
    const result = normalise5eSheet(legacy);
    expect(result.equipment).toBe('');
  });

  it('clamps legacy ability score below 1 to 1', () => {
    const legacy = { attributes: { STR: -5, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } };
    const result = normalise5eSheet(legacy);
    expect(result.abilities.STR).toBe(1);
  });

  it('always has 9 spell slots in migrated legacy sheet', () => {
    const legacy = { hp: 10, maxHp: 10 };
    const result = normalise5eSheet(legacy);
    expect(result.spellcasting.slots).toHaveLength(9);
  });

  // -------------------------------------------------------------------------
  // Idempotent: normalising a normalised sheet returns equivalent result
  // -------------------------------------------------------------------------
  it('is idempotent: normalise5e(normalise5e(x)) deepEquals normalise5e(x)', () => {
    const legacy = {
      attributes: { STR: 14, DEX: 12, CON: 10, INT: 8, WIS: 11, CHA: 9 },
      hp: 20,
      maxHp: 24,
      ac: 13,
      speed: 30,
      skills: [{ name: 'Stealth', proficient: true }],
      inventory: ['Dagger'],
      spells: [],
    };
    const once = normalise5eSheet(legacy);
    const twice = normalise5eSheet(once);
    expect(twice).toEqual(once);
  });
});

// =============================================================================
// Backward compat — vitals location migration
// =============================================================================

describe('normalise5eSheet — vitals location compat', () => {
  it('reads hp/ac/speed from legacy combat block for old DB records (kind=5e)', () => {
    const legacyDb = {
      kind: '5e',
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      saveProfs: { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false },
      skills: {},
      combat: { hp: 25, maxHp: 30, ac: 14, speed: 35, initiativeOverride: 2 },
      attacks: [],
      spellcasting: { slots: Array.from({ length: 9 }, () => ({ current: 0, max: 0 })) },
      personality: {},
      spells: [],
    };
    const result = normalise5eSheet(legacyDb);
    expect(result.vitals.hp).toBe(25);
    expect(result.vitals.maxHp).toBe(30);
    expect(result.vitals.ac).toBe(14);
    expect(result.vitals.speed).toBe(35);
    expect(result.vitals.initiativeOverride).toBe(2);
  });

  it('prefers vitals field over combat fallback when both present', () => {
    const newShape = {
      kind: '5e',
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      saveProfs: { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false },
      skills: {},
      vitals: { hp: 99, maxHp: 100 },
      combat: { hp: 1, maxHp: 2 },
      attacks: [],
      spellcasting: { slots: Array.from({ length: 9 }, () => ({ current: 0, max: 0 })) },
      personality: {},
      spells: [],
    };
    const result = normalise5eSheet(newShape);
    expect(result.vitals.hp).toBe(99);
    expect(result.vitals.maxHp).toBe(100);
  });
});

// =============================================================================
// normaliseCharacterSheet — universal dispatcher
// =============================================================================

describe('normaliseCharacterSheet', () => {
  it('returns SheetPdf with hp=25 when kind=pdf', () => {
    const result = normaliseCharacterSheet({ kind: 'pdf', vitals: { hp: 25 } });
    expect(result.kind).toBe('pdf');
    if (result.kind === 'pdf') {
      expect(result.vitals.hp).toBe(25);
    }
  });

  it('returns SheetVitals with notes when kind=vitals', () => {
    const result = normaliseCharacterSheet({ kind: 'vitals', notes: 'hi', vitals: {} });
    expect(result.kind).toBe('vitals');
    if (result.kind === 'vitals') {
      expect(result.notes).toBe('hi');
    }
  });

  it('falls through to Sheet5e default for unknown kind', () => {
    const result = normaliseCharacterSheet({ kind: 'unknown' });
    expect(result.kind).toBe('5e');
  });

  it('falls through to Sheet5e for null input', () => {
    const result = normaliseCharacterSheet(null);
    expect(result.kind).toBe('5e');
  });
});

// =============================================================================
// normaliseVitalsBlock
// =============================================================================

describe('normaliseVitalsBlock', () => {
  it('converts valid numbers', () => {
    const result = normaliseVitalsBlock({ hp: 30, maxHp: 40, ac: 15 });
    expect(result.hp).toBe(30);
    expect(result.maxHp).toBe(40);
    expect(result.ac).toBe(15);
  });

  it('converts non-number hp to null', () => {
    const result = normaliseVitalsBlock({ hp: 'bad', maxHp: null });
    expect(result.hp).toBeNull();
    expect(result.maxHp).toBeNull();
  });

  it('returns empty object for non-object input', () => {
    const result = normaliseVitalsBlock('garbage');
    expect(result).toEqual({});
  });

  it('sets undefined fields to null', () => {
    const result = normaliseVitalsBlock({});
    expect(result.hp).toBeNull();
    expect(result.speed).toBeNull();
  });
});

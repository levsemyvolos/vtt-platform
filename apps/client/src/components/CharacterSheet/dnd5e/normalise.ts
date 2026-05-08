/**
 * normalise.ts — defensive normaliser for character sheet data.
 *
 * normaliseCharacterSheet: universal entry point — dispatches to 5e, pdf, or vitals.
 * normalise5eSheet: legacy entry point for 5e-only consumers — still exported.
 *
 * Never throws.
 */
import type {
  CharacterSheetData,
  Sheet5e,
  SheetPdf,
  SheetVitals,
  VitalsBlock,
  SkillProf,
  Skills5e,
  AttackEntry5e,
  SpellEntry,
  Ability,
  SkillId,
  Identity5e,
  Combat5e,
  Personality5e,
  SpellSlot,
  Spellcasting5e,
  SaveProfs5e,
  Abilities5e,
} from '@vtt/shared';
import { makeEmpty5eSheet, ALL_SKILL_IDS } from '@vtt/shared';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function clampAbility(v: unknown): number {
  const n = safeNum(v, 10);
  return Math.min(30, Math.max(1, n));
}

const ABILITY_KEYS: ReadonlyArray<Ability> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

function mergeAbilities(raw: unknown, empty: Abilities5e): Abilities5e {
  if (!isObject(raw)) return { ...empty };
  const result = { ...empty };
  for (const ab of ABILITY_KEYS) {
    if (ab in raw) result[ab] = clampAbility(raw[ab]);
  }
  return result;
}

function mergeSaveProfs(raw: unknown, empty: SaveProfs5e): SaveProfs5e {
  if (!isObject(raw)) return { ...empty };
  const result = { ...empty };
  for (const ab of ABILITY_KEYS) {
    if (ab in raw) result[ab] = raw[ab] === true;
  }
  return result;
}

const SKILL_PROF_VALUES = new Set<SkillProf>(['none', 'proficient', 'expertise']);

function mergeSkills(raw: unknown, empty: Skills5e): Skills5e {
  if (!isObject(raw)) return { ...empty };
  const result = { ...empty };
  for (const id of ALL_SKILL_IDS) {
    const v = raw[id];
    if (SKILL_PROF_VALUES.has(v as SkillProf)) {
      result[id] = v as SkillProf;
    }
  }
  return result;
}

function mergeCombat(raw: unknown, empty: Combat5e): Combat5e {
  if (!isObject(raw)) return { ...empty };
  const DIE_TYPES = new Set<string>(['d6', 'd8', 'd10', 'd12']);
  const result: Combat5e = {
    hitDiceTotal: typeof raw.hitDiceTotal === 'number' ? raw.hitDiceTotal : null,
    hitDiceUsed: typeof raw.hitDiceUsed === 'number' ? raw.hitDiceUsed : null,
    inspiration: raw.inspiration === true,
  };
  if (DIE_TYPES.has(raw.hitDiceType as string)) {
    result.hitDiceType = raw.hitDiceType as 'd6' | 'd8' | 'd10' | 'd12';
  }
  return result;
}

/**
 * Reads vitals from the new canonical location (`r.vitals`) first;
 * falls back to the legacy location inside `r.combat` for old DB records.
 */
function normalise5eVitals(r: Record<string, unknown>): VitalsBlock {
  if (isObject(r.vitals)) {
    return normaliseVitalsBlock(r.vitals);
  }
  // Legacy: vitals lived inside combat block
  if (isObject(r.combat)) {
    return normaliseVitalsBlock(r.combat);
  }
  return {};
}

function mergeIdentity(raw: unknown, empty: Identity5e): Identity5e {
  if (!isObject(raw)) return { ...empty };
  const result: Identity5e = {};
  if (typeof raw.className === 'string') result.className = raw.className;
  if (typeof raw.level === 'number') result.level = Math.min(20, Math.max(1, raw.level));
  if (typeof raw.race === 'string') result.race = raw.race;
  if (typeof raw.background === 'string') result.background = raw.background;
  if (typeof raw.alignment === 'string') result.alignment = raw.alignment;
  if (typeof raw.experiencePoints === 'number') result.experiencePoints = raw.experiencePoints;
  return result;
}

function mergePersonality(raw: unknown, empty: Personality5e): Personality5e {
  if (!isObject(raw)) return { ...empty };
  const result: Personality5e = {};
  const textFields: Array<keyof Personality5e> = ['traits', 'ideals', 'bonds', 'flaws', 'features'];
  for (const f of textFields) {
    if (typeof raw[f] === 'string') result[f] = raw[f] as string;
  }
  return result;
}

function mergeAttacks(raw: unknown): AttackEntry5e[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is AttackEntry5e =>
      isObject(a) &&
      typeof a.name === 'string' &&
      typeof a.atkBonus === 'string' &&
      typeof a.damage === 'string',
  );
}

const SPELL_LEVELS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

function mergeSpells(raw: unknown): SpellEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SpellEntry =>
      isObject(s) &&
      typeof s.name === 'string' &&
      SPELL_LEVELS.has(s.level as number) &&
      typeof s.description === 'string',
  );
}

function normaliseSlots(raw: unknown): SpellSlot[] {
  const template = Array.from({ length: 9 }, (): SpellSlot => ({ current: 0, max: 0 }));
  if (!Array.isArray(raw)) return template;
  return template.map((def, i) => {
    const item = raw[i];
    if (!isObject(item)) return def;
    return {
      current: safeNum(item.current, 0),
      max: safeNum(item.max, 0),
    };
  });
}

function mergeSpellcasting(raw: unknown, empty: Spellcasting5e): Spellcasting5e {
  if (!isObject(raw)) return { ...empty, slots: normaliseSlots(undefined) };
  const SPELL_ABILITIES = new Set<Ability>(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
  return {
    spellAbility: SPELL_ABILITIES.has(raw.spellAbility as Ability)
      ? (raw.spellAbility as Ability)
      : null,
    saveDcOverride:
      typeof raw.saveDcOverride === 'number' ? raw.saveDcOverride : null,
    attackBonusOverride:
      typeof raw.attackBonusOverride === 'number' ? raw.attackBonusOverride : null,
    slots: normaliseSlots(raw.slots),
  };
}

// ---------------------------------------------------------------------------
// Patch new-shape passthrough — fill any missing holes with empty defaults.
// ---------------------------------------------------------------------------

function mergeWithEmpty(r: Record<string, unknown>, empty: Sheet5e): Sheet5e {
  const result: Sheet5e = {
    kind: '5e',
    identity: mergeIdentity(r.identity, empty.identity),
    abilities: mergeAbilities(r.abilities, empty.abilities),
    saveProfs: mergeSaveProfs(r.saveProfs, empty.saveProfs),
    skills: mergeSkills(r.skills, empty.skills),
    vitals: normalise5eVitals(r),
    combat: mergeCombat(r.combat, empty.combat),
    attacks: mergeAttacks(r.attacks),
    spellcasting: mergeSpellcasting(r.spellcasting, empty.spellcasting),
    personality: mergePersonality(r.personality, empty.personality),
    spells: mergeSpells(r.spells),
  };
  if (typeof r.otherProfs === 'string') result.otherProfs = r.otherProfs;
  if (typeof r.equipment === 'string') result.equipment = r.equipment;
  return result;
}

// ---------------------------------------------------------------------------
// Legacy migration — old SheetData shape from before S6.
// ---------------------------------------------------------------------------

/** Map legacy skill display name (lowercase) → SkillId. */
const LEGACY_SKILL_MAP: Readonly<Record<string, SkillId>> = {
  acrobatics: 'acrobatics',
  'animal handling': 'animalHandling',
  arcana: 'arcana',
  athletics: 'athletics',
  deception: 'deception',
  history: 'history',
  insight: 'insight',
  intimidation: 'intimidation',
  investigation: 'investigation',
  medicine: 'medicine',
  nature: 'nature',
  perception: 'perception',
  performance: 'performance',
  persuasion: 'persuasion',
  religion: 'religion',
  'sleight of hand': 'sleightOfHand',
  stealth: 'stealth',
  survival: 'survival',
};

function migrateLegacySkills(raw: unknown, empty: Skills5e): Skills5e {
  const result = { ...empty };
  if (!Array.isArray(raw)) return result;
  for (const item of raw) {
    if (!isObject(item)) continue;
    const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
    const skillId = LEGACY_SKILL_MAP[name];
    if (skillId) {
      result[skillId] = item.proficient === true ? 'proficient' : 'none';
    }
  }
  return result;
}

function migrateLegacyAbilities(raw: unknown, empty: Abilities5e): Abilities5e {
  if (!isObject(raw)) return { ...empty };
  return {
    STR: clampAbility(raw.STR),
    DEX: clampAbility(raw.DEX),
    CON: clampAbility(raw.CON),
    INT: clampAbility(raw.INT),
    WIS: clampAbility(raw.WIS),
    CHA: clampAbility(raw.CHA),
  };
}

function migrateLegacy(r: Record<string, unknown>, empty: Sheet5e): Sheet5e {
  const abilities = migrateLegacyAbilities(r.attributes, empty.abilities);

  // Legacy vitals lived as flat fields on the root object.
  const legacyVitalsRaw: Record<string, unknown> = {
    hp: r.hp,
    maxHp: r.maxHp,
    ac: r.ac,
    speed: r.speed,
  };
  const vitals: VitalsBlock = normaliseVitalsBlock(legacyVitalsRaw);

  const result: Sheet5e = {
    kind: '5e',
    identity: {},
    abilities,
    saveProfs: { ...empty.saveProfs },
    skills: migrateLegacySkills(r.skills, empty.skills),
    vitals,
    combat: mergeCombat({}, empty.combat),
    attacks: [],
    spellcasting: {
      spellAbility: null,
      saveDcOverride: null,
      attackBonusOverride: null,
      slots: normaliseSlots(undefined),
    },
    personality: {},
    spells: mergeSpells(r.spells),
  };

  if (Array.isArray(r.inventory)) {
    result.equipment = (r.inventory as unknown[])
      .filter((x): x is string => typeof x === 'string')
      .join('\n');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API — 5e-only (legacy entry point, still exported)
// ---------------------------------------------------------------------------

/**
 * Normalise any unknown server payload into a valid Sheet5e.
 * Idempotent: passing a valid Sheet5e returns an equivalent Sheet5e.
 * Never throws.
 */
export function normalise5eSheet(raw: unknown): Sheet5e {
  const empty = makeEmpty5eSheet();
  if (!isObject(raw)) return empty;
  const r = raw as Record<string, unknown>;

  if (r.kind === '5e') {
    return mergeWithEmpty(r, empty);
  }

  return migrateLegacy(r, empty);
}

// ---------------------------------------------------------------------------
// VitalsBlock normaliser (shared by pdf and vitals sheets)
// ---------------------------------------------------------------------------

function normaliseVitalsBlock(raw: unknown): VitalsBlock {
  if (!isObject(raw)) return {};
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' ? v : null;
  return {
    hp: num(r.hp),
    maxHp: num(r.maxHp),
    tempHp: num(r.tempHp),
    ac: num(r.ac),
    initiativeOverride: num(r.initiativeOverride),
    speed: num(r.speed),
  };
}

// ---------------------------------------------------------------------------
// SheetPdf normaliser
// ---------------------------------------------------------------------------

function normalisePdfSheet(r: Record<string, unknown>): SheetPdf {
  const sheet: SheetPdf = {
    kind: 'pdf',
    vitals: normaliseVitalsBlock(r.vitals),
  };
  // Pass through archived snapshots as-is — they are validated when needed.
  if (isObject(r._archived5e)) {
    sheet._archived5e = normalise5eSheet(r._archived5e);
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// SheetVitals normaliser
// ---------------------------------------------------------------------------

function normaliseVitalsSheet(r: Record<string, unknown>): SheetVitals {
  const sheet: SheetVitals = {
    kind: 'vitals',
    vitals: normaliseVitalsBlock(r.vitals),
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
  if (isObject(r._archived5e)) {
    sheet._archived5e = normalise5eSheet(r._archived5e);
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// Universal public entry point
// ---------------------------------------------------------------------------

/**
 * Normalise any unknown server payload into a typed CharacterSheetData.
 * Dispatches by `kind`: 'pdf' → SheetPdf, 'vitals' → SheetVitals,
 * '5e' or anything else → Sheet5e (including legacy migration).
 * Never throws.
 */
export function normaliseCharacterSheet(raw: unknown): CharacterSheetData {
  if (!isObject(raw)) return normalise5eSheet(raw);
  const r = raw as Record<string, unknown>;
  if (r.kind === 'pdf') return normalisePdfSheet(r);
  if (r.kind === 'vitals') return normaliseVitalsSheet(r);
  return normalise5eSheet(raw);
}

// Re-export normaliseVitalsBlock for direct use in VitalsStrip
export { normaliseVitalsBlock };

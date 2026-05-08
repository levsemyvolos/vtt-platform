import type { SpellEntry } from './characters';

export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export type SkillId =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics'
  | 'deception' | 'history' | 'insight' | 'intimidation'
  | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion'
  | 'sleightOfHand' | 'stealth' | 'survival';

/** Skill → governing ability per D&D 5e PHB. */
export const SKILL_ABILITY: Readonly<Record<SkillId, Ability>> = {
  acrobatics: 'DEX', animalHandling: 'WIS', arcana: 'INT', athletics: 'STR',
  deception: 'CHA', history: 'INT', insight: 'WIS', intimidation: 'CHA',
  investigation: 'INT', medicine: 'WIS', nature: 'INT', perception: 'WIS',
  performance: 'CHA', persuasion: 'CHA', religion: 'INT',
  sleightOfHand: 'DEX', stealth: 'DEX', survival: 'WIS',
};

export const ALL_ABILITIES: ReadonlyArray<Ability> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export const ALL_SKILL_IDS: ReadonlyArray<SkillId> = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics',
  'deception', 'history', 'insight', 'intimidation',
  'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion',
  'sleightOfHand', 'stealth', 'survival',
];

export interface Identity5e {
  className?: string;
  level?: number;
  race?: string;
  background?: string;
  alignment?: string;
  experiencePoints?: number;
}

export interface Abilities5e {
  STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number;
}

export interface SaveProfs5e {
  STR: boolean; DEX: boolean; CON: boolean; INT: boolean; WIS: boolean; CHA: boolean;
}

export type SkillProf = 'none' | 'proficient' | 'expertise';
export type Skills5e = Record<SkillId, SkillProf>;

export interface Combat5e {
  hitDiceTotal?: number | null;
  hitDiceUsed?: number | null;
  hitDiceType?: 'd6' | 'd8' | 'd10' | 'd12';
  inspiration?: boolean;
}

export interface VitalsBlock {
  hp?: number | null;
  maxHp?: number | null;
  tempHp?: number | null;
  ac?: number | null;
  initiativeOverride?: number | null;
  speed?: number | null;
}

export interface AttackEntry5e {
  name: string;
  atkBonus: string;
  damage: string;
}

export interface SpellSlot {
  current: number;
  max: number;
}

export interface Spellcasting5e {
  spellAbility?: Ability | null;
  saveDcOverride?: number | null;
  attackBonusOverride?: number | null;
  /** Indexed 0..8 for spell levels 1..9. Always length-9. */
  slots: SpellSlot[];
}

export interface Personality5e {
  traits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  features?: string;
}

export interface Sheet5e {
  kind: '5e';
  identity: Identity5e;
  abilities: Abilities5e;
  saveProfs: SaveProfs5e;
  skills: Skills5e;
  vitals: VitalsBlock;
  combat: Combat5e;
  attacks: AttackEntry5e[];
  spellcasting: Spellcasting5e;
  personality: Personality5e;
  otherProfs?: string;
  equipment?: string;
  spells: SpellEntry[];
}

export interface SheetPdf {
  kind: 'pdf';
  vitals: VitalsBlock;
  /** Snapshot of last 5e shape so user can switch back without losing work. */
  _archived5e?: Sheet5e;
  _archivedVitals?: SheetVitals;
}

export interface SheetVitals {
  kind: 'vitals';
  vitals: VitalsBlock;
  notes: string;
  _archived5e?: Sheet5e;
  _archivedPdf?: SheetPdf;
}

export type CharacterSheetData = Sheet5e | SheetPdf | SheetVitals;

export type SheetMode = '5e' | 'pdf' | 'vitals';

export function makeEmptyVitalsBlock(): VitalsBlock {
  return {};
}

export function makeEmptyPdfSheet(): SheetPdf {
  return { kind: 'pdf', vitals: {} };
}

export function makeEmptyVitalsSheet(): SheetVitals {
  return { kind: 'vitals', vitals: {}, notes: '' };
}

export const DEFAULT_ABILITIES_5E: Readonly<Abilities5e> = {
  STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
};

export const DEFAULT_SAVE_PROFS_5E: Readonly<SaveProfs5e> = {
  STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false,
};

/** All 18 skills, all 'none'. */
export function makeDefaultSkills5e(): Skills5e {
  const skills = {} as Skills5e;
  for (const id of ALL_SKILL_IDS) {
    skills[id] = 'none';
  }
  return skills;
}

/** Empty sheet: standard 10s for abilities; everything else null/empty per hybrid-defaults strategy. */
export function makeEmpty5eSheet(): Sheet5e {
  return {
    kind: '5e',
    identity: {},
    abilities: { ...DEFAULT_ABILITIES_5E },
    saveProfs: { ...DEFAULT_SAVE_PROFS_5E },
    skills: makeDefaultSkills5e(),
    vitals: {},
    combat: {},
    attacks: [],
    spellcasting: { slots: Array.from({ length: 9 }, () => ({ current: 0, max: 0 })) },
    personality: {},
    spells: [],
  };
}

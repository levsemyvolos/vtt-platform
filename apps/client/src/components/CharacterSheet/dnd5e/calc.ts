import type { Sheet5e, Ability, SkillId, CharacterSheetData, VitalsBlock } from '@vtt/shared';
import { SKILL_ABILITY } from '@vtt/shared';

/** Returns the D&D 5e ability modifier for a raw score. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Returns proficiency bonus for a given character level.
 * Clamps to [1,20]; null/undefined level defaults to 1.
 * Formula: Math.ceil(lvl / 4) + 1 → 1-4→2, 5-8→3, 9-12→4, 13-16→5, 17-20→6.
 */
export function proficiencyBonus(level: number | null | undefined): number {
  const lvl =
    typeof level === 'number' ? Math.min(20, Math.max(1, level)) : 1;
  return Math.ceil(lvl / 4) + 1;
}

/** Saving throw modifier for one ability. */
export function saveModFor(sheet: Sheet5e, ability: Ability): number {
  const score = sheet.abilities[ability];
  const prof = sheet.saveProfs[ability];
  return abilityMod(score) + (prof ? proficiencyBonus(sheet.identity.level) : 0);
}

/** Skill check modifier for one skill, respecting 'none'/'proficient'/'expertise'. */
export function skillModFor(sheet: Sheet5e, skill: SkillId): number {
  const ab = SKILL_ABILITY[skill];
  const score = sheet.abilities[ab];
  const tier = sheet.skills[skill] ?? 'none'; // tolerant: missing key → none
  const profB = proficiencyBonus(sheet.identity.level);
  const bonus =
    tier === 'expertise' ? profB * 2 : tier === 'proficient' ? profB : 0;
  return abilityMod(score) + bonus;
}

/** Passive Perception = 10 + Perception skill modifier. */
export function passivePerception(sheet: Sheet5e): number {
  return 10 + skillModFor(sheet, 'perception');
}

/**
 * Spell save DC. Returns null when no spellAbility is set.
 * Respects saveDcOverride when set.
 */
export function spellSaveDc(sheet: Sheet5e): number | null {
  const ab = sheet.spellcasting.spellAbility;
  if (!ab) return null;
  const o = sheet.spellcasting.saveDcOverride;
  if (typeof o === 'number') return o;
  return (
    8 +
    proficiencyBonus(sheet.identity.level) +
    abilityMod(sheet.abilities[ab])
  );
}

/**
 * Spell attack bonus. Returns null when no spellAbility is set.
 * Respects attackBonusOverride when set.
 */
export function spellAttackBonus(sheet: Sheet5e): number | null {
  const ab = sheet.spellcasting.spellAbility;
  if (!ab) return null;
  const o = sheet.spellcasting.attackBonusOverride;
  if (typeof o === 'number') return o;
  return (
    proficiencyBonus(sheet.identity.level) +
    abilityMod(sheet.abilities[ab])
  );
}

/**
 * Initiative modifier. Respects initiativeOverride when set.
 * Defaults to DEX modifier.
 */
export function initiativeMod(sheet: Sheet5e): number {
  const o = sheet.vitals.initiativeOverride;
  if (typeof o === 'number') return o;
  return abilityMod(sheet.abilities.DEX);
}

/** Formats a modifier as "+3", "-1", or "0". */
export function formatMod(mod: number): string {
  if (mod > 0) return `+${mod}`;
  if (mod < 0) return String(mod);
  return '0';
}

/**
 * Extracts a VitalsBlock from any CharacterSheetData variant.
 * After the T2 refactor all three kinds expose vitals at the same path.
 */
export function extractVitals(sheet: CharacterSheetData): VitalsBlock {
  return sheet.vitals;
}

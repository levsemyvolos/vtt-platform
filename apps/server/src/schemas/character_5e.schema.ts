import { z } from 'zod';

export const abilityEnum = z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);

export const skillIdEnum = z.enum([
  'acrobatics', 'animalHandling', 'arcana', 'athletics',
  'deception', 'history', 'insight', 'intimidation',
  'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion',
  'sleightOfHand', 'stealth', 'survival',
]);

export const skillProfEnum = z.enum(['none', 'proficient', 'expertise']);

const abilityScore = z.number().int().min(1).max(30);

const identitySchema = z.object({
  className: z.string().max(64).optional(),
  level: z.number().int().min(1).max(20).optional(),
  race: z.string().max(64).optional(),
  background: z.string().max(64).optional(),
  alignment: z.string().max(32).optional(),
  experiencePoints: z.number().int().min(0).max(355000).optional(),
});

const abilitiesSchema = z.object({
  STR: abilityScore, DEX: abilityScore, CON: abilityScore,
  INT: abilityScore, WIS: abilityScore, CHA: abilityScore,
});

const saveProfsSchema = z.object({
  STR: z.boolean(), DEX: z.boolean(), CON: z.boolean(),
  INT: z.boolean(), WIS: z.boolean(), CHA: z.boolean(),
});

const skillsSchema = z.record(skillIdEnum, skillProfEnum);   // all 18 keys, value = SkillProf

// ---------------------------------------------------------------------------
// Vitals — universal block shared by all three sheet kinds.
// Must be declared before sheet5eSchema which now references it.
// ---------------------------------------------------------------------------

export const vitalsBlockSchema = z.object({
  hp: z.number().int().min(0).max(9999).nullable().optional(),
  maxHp: z.number().int().min(0).max(9999).nullable().optional(),
  tempHp: z.number().int().min(0).max(9999).nullable().optional(),
  ac: z.number().int().min(0).max(40).nullable().optional(),
  initiativeOverride: z.number().int().min(-10).max(20).nullable().optional(),
  speed: z.number().int().min(0).max(120).nullable().optional(),
});

export type VitalsBlockInput = z.infer<typeof vitalsBlockSchema>;

const combatSchema = z.object({
  hitDiceTotal: z.number().int().min(0).max(20).nullable().optional(),
  hitDiceUsed: z.number().int().min(0).max(20).nullable().optional(),
  hitDiceType: z.enum(['d6', 'd8', 'd10', 'd12']).optional(),
  inspiration: z.boolean().optional(),
});

const attackSchema = z.object({
  name: z.string().max(64),
  atkBonus: z.string().max(16),
  damage: z.string().max(64),
});

const spellSlotSchema = z.object({
  current: z.number().int().min(0).max(20),
  max: z.number().int().min(0).max(20),
});

const spellcastingSchema = z.object({
  spellAbility: abilityEnum.nullable().optional(),
  saveDcOverride: z.number().int().min(0).max(40).nullable().optional(),
  attackBonusOverride: z.number().int().min(-5).max(20).nullable().optional(),
  slots: z.array(spellSlotSchema).length(9),
});

const personalitySchema = z.object({
  traits: z.string().max(2000).optional(),
  ideals: z.string().max(2000).optional(),
  bonds: z.string().max(2000).optional(),
  flaws: z.string().max(2000).optional(),
  features: z.string().max(4000).optional(),
});

/** SpellEntry shape from packages/shared/src/rest/characters.ts: { name, level: 0..9, description } */
const spellEntrySchema = z.object({
  name: z.string().max(256),
  level: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4),
    z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9),
  ]),
  description: z.string().max(4000),
});

export const sheet5eSchema = z.object({
  kind: z.literal('5e'),
  identity: identitySchema,
  abilities: abilitiesSchema,
  saveProfs: saveProfsSchema,
  skills: skillsSchema,
  vitals: vitalsBlockSchema,
  combat: combatSchema,
  attacks: z.array(attackSchema).max(20),
  spellcasting: spellcastingSchema,
  personality: personalitySchema,
  otherProfs: z.string().max(2000).optional(),
  equipment: z.string().max(4000).optional(),
  spells: z.array(spellEntrySchema).max(200),
});

export type Sheet5eInput = z.infer<typeof sheet5eSchema>;

// ---------------------------------------------------------------------------
// PDF + Vitals-only sheet schemas
// ---------------------------------------------------------------------------

// Forward-ref helpers because of the recursive _archived* fields.
// We use z.lazy() to break the cycle.
// NOTE: exactOptionalPropertyTypes is enabled in tsconfig — we cannot use
//       z.ZodType<ShapeWithOptionals> because Zod infers optional fields as
//       `T | undefined` whereas exactOptionalPropertyTypes treats `x?: T` and
//       `x?: T | undefined` differently. We declare the schemas without
//       explicit type annotations and cast to z.ZodTypeAny where needed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive lazy schema requires any to avoid exactOptionalPropertyTypes incompatibility
export const sheetPdfSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    kind: z.literal('pdf'),
    vitals: vitalsBlockSchema,
    _archived5e: sheet5eSchema.optional(),
    _archivedVitals: sheetVitalsSchema.optional(),
  }),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive lazy schema requires any to avoid exactOptionalPropertyTypes incompatibility
export const sheetVitalsSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    kind: z.literal('vitals'),
    vitals: vitalsBlockSchema,
    notes: z.string().max(20000),
    _archived5e: sheet5eSchema.optional(),
    _archivedPdf: sheetPdfSchema.optional(),
  }),
);

// z.discriminatedUnion requires non-lazy ZodObject members.
// Since sheetPdf/sheetVitals use z.lazy() for the recursive _archived* fields
// we use z.union here — still fully type-safe, just no O(1) discriminator lookup.
export const characterSheetSchema = z.union([
  sheet5eSchema,
  sheetPdfSchema,
  sheetVitalsSchema,
]);

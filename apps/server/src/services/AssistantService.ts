import { randomUUID } from 'crypto';
import type { AIProvider, TextGenerationRequest } from '../infrastructure/ai/AIProvider.js';
import type {
  AssistantContext,
  AssistantTextRequest,
  AssistantTextResponse,
  AssistantMessageDTO,
  SaveAssistantMessageRequest,
  AssistantHistoryResponse,
  AssistantConversationDTO,
  CreateAssistantConversationRequest,
  RenameAssistantConversationRequest,
  ListAssistantConversationsResponse,
  AssistantStreamEvent,
  AssistantStreamRequest,
  AIQuotaResponse,
  AssistantVariables,
  PromptAssistRequest,
  PromptAssistResponse,
  PromptAssistTarget,
} from '@vtt/shared';
import type { AssistantMessageRepository } from '../repositories/AssistantMessageRepository.js';
import type { AssistantConversationRepository } from '../repositories/AssistantConversationRepository.js';
import type { SessionContextBuilder } from './SessionContextBuilder.js';
import type { AssetRepository } from '../repositories/AssetRepository.js';

// SYSTEM_PROMPTS — v2.1.0 | Updated: 2026-05-09
// English instructions + Ukrainian output; contradiction engine, five-senses mandate,
// SRD anti-hallucination protocol, license-bounded scope (SRD 5.1 CC-BY 4.0),
// section headings in Ukrainian, [Ruleset] variable injection.
export const SYSTEM_PROMPTS_VERSION = '2.1.0';

export const SYSTEM_PROMPTS: Record<AssistantContext, string> = {
  'npc-description': `You are a master-tier TTRPG Game Master and narrative designer acting as a specialized NPC generation engine.

Your task: produce a fully game-ready NPC the GM can use immediately at the table.

RULES:
1. ONE VERBAL MANNERISM — a distinctive speech habit the GM can perform (e.g., "ends every sentence with a question", "speaks only in metaphors about weather").
2. ONE PHYSICAL MANNERISM — an actionable gesture (e.g., "taps a coin on the table when nervous", "never makes eye contact").
3. CONTRADICTION ENGINE — the NPC's dominant personality trait must clash with a visible flaw (e.g., a fearless mercenary who flinches at raised voices; a wise mentor hiding active addiction).
4. ACTIONABLE SECRET — not backstory. An ongoing situation the players can discover through roleplay or Investigation. Must create a plot hook.
5. MECHANICAL STATBLOCK — when the user specifies a system and level, provide a concise statblock using only official mechanics of that system. If you lack certainty about a specific value, state your assumption explicitly. Never invent spells, conditions, or feats that do not exist in the specified system.
6. DEFAULT SYSTEM — if the user does NOT specify a system, assume D&D 5e (SRD 5.1) and produce the statblock under that ruleset; clearly declare this assumption in **Припущення**.
7. LICENSE-BOUNDED STATBLOCK — your knowledge is restricted to the OFFICIAL OPEN-LICENSE corpus of the specified ruleset (CC-BY 4.0 SRD 5.1 for D&D 5e; ORC for Pathfinder 2e; CC-BY-SA for Cairn 2e; CC-BY 3.0 for Dungeon World). If the requested NPC requires mechanics from a closed rulebook (e.g., D&D 2024 PHB exclusive class features, Tasha's/Xanathar's/Spelljammer/Eberron material, Echo Knight from EGtW, Mothership 1e or Call of Cthulhu 7e proprietary text), you MUST NOT recall those mechanics from training data, paraphrase them, or invent plausible substitutes. Output the statblock section EXACTLY as: "Це не входить у відкриту ліцензію {Ruleset}; зверніться до офіційного rulebook." — substituting the user's chosen ruleset name verbatim. Then continue with the non-mechanical sections (Appearance, Mannerisms, Motivation, Contradiction, Secret) as normal.

OUTPUT FORMAT — always use these headings in this order:
**[Ім'я]** — [концепт із 2 прикметників + 1 іменник]
**Зовнішність:** [3–5 vivid details, focus on scars, carried items, unusual clothing]
**Вербальна манера:** [one sentence]
**Фізична манера:** [one sentence]
**Мотивація:** [1–2 sentences — what they want right now]
**Контрадикція:** [explicit statement of how their strength and flaw clash]
**Таємниця / Гачок:** [1–3 sentences — the ongoing situation]
**Зразок діалогу:** "[One or two lines in their voice]"
**Statblock ([Система], [Рівень/CR]):** [concise statblock]
**Припущення:** [any non-obvious rules decisions, or "Немає"]

Respond in Ukrainian. Use the Ukrainian section headers exactly as shown above.`,

  'scene-description': `You are a world-class environmental narrative designer for Tabletop Roleplaying Games. Your output powers a Virtual Tabletop platform.

Your task: produce a sensory-rich, immediately playable location description.

RULES:
1. FIVE SENSES MANDATE — you must include at least one detail from each active sense: sight (lighting, color, shape), sound (ambient, distant, rhythmic), smell (one specific olfactory anchor), touch/temperature (surface texture or air temperature), and optionally taste.
2. SHOW, DON'T TELL — never say "you feel scared." Describe the environment so it produces that feeling. Wrong: "The room feels threatening." Right: "The shadows beneath the altar stretch disproportionately long, reaching toward the doorway."
3. CONSTANTS AND EXCEPTIONS — first establish the baseline (dimensions, dominant material, lighting type), then focus on ONE anomaly that demands player attention.
4. INTERACTIVE FEATURES — include at least 3 specific objects or environmental elements players can touch, examine, climb, or use.
5. STRICT TWO-PART OUTPUT — always produce both sections below. Part 1 must not exceed 900 characters (≈ 150 English words; players lose focus on longer read-alouds). Part 2 is GM-only.

OUTPUT FORMAT:

--- READ-ALOUD (≤900 characters, second-person present tense) ---
[Write for the players. Start with "Ви…" or "Повітря…". No GM secrets here.]

--- GM NOTES ---
- Приховані елементи: [what is concealed and where]
- Інтерактивні об'єкти: [list with possible interactions]
- Перевірки навичок: [e.g., "Сприйняття DC 14 помічає щілину за гобеленом"]
- Просторові розміри: [rough size, ceiling height]
- Небезпеки / пастки: [if any]
- Зв'язки з більшою пригодою: [optional GM hooks]

Respond in Ukrainian. Keep the section dividers and labels in Ukrainian exactly as shown above.`,

  'srd-lookup': `You are an uncompromising, mathematically precise Rules Arbitrator for Tabletop Roleplaying Games.

Your ONLY authority is the official System Reference Document (SRD) of the game system specified by the user. You have zero creative writing capability in this mode — you are a strict mechanical referee.

HARD CONSTRAINTS:
1. BASE ALL RULINGS EXCLUSIVELY on the published SRD of the specified system and edition. No homebrew, no extrapolation from other game systems, no "it makes sense that…" reasoning.
2. "I DO NOT KNOW" PROTOCOL — if the SRD does not explicitly cover the queried scenario, you MUST NOT guess. Output exactly: "SRD не надає явного правила для цього сценарію. Це залишається на розсуд Game Master." Then you may optionally suggest 1–2 clearly labeled house rule options.
3. MANDATORY CITATION — for every mechanical claim, name the rule, condition, spell, or mechanic. Use direct quotes from the rulebook when possible.
4. CHAIN-OF-THOUGHT REASONING — for complex interactions (stacked modifiers, overlapping effects, multi-step maneuvers) you must expose your logic: break the scenario into discrete steps, evaluate each independently, then synthesize the final ruling.
5. CROSS-SYSTEM LOCK — if the user's question involves mechanics from a different system than specified, state that clearly and refuse to mix systems.
6. DEFAULT SYSTEM — if the user does NOT specify a game system and edition, assume D&D 5e (SRD 5.1) and proceed; note this assumption in **Граничні випадки**.
7. SESSION-CONTEXT CONFLICT — if the session-context block (initiative tracker, party characters, scene notes) contains homebrew or non-SRD content (e.g., custom monsters, third-party classes, expansions like Tasha's/Xanathar's), IGNORE it when deriving the ruling. Mention in **Граничні випадки** that the session contains non-SRD content and the ruling applies only to the canonical SRD baseline.
8. LICENSE-BOUNDED SCOPE — your knowledge is restricted to the OFFICIAL OPEN-LICENSE corpus of the specified ruleset (CC-BY 4.0 SRD 5.1 for D&D 5e; ORC for Pathfinder 2e; CC-BY-SA for Cairn 2e; CC-BY 3.0 for Dungeon World). If the question requires content beyond that open-license text — including but not limited to D&D 2024 PHB exclusive rules, Tasha's/Xanathar's/Spelljammer/Eberron, Echo Knight (EGtW), Mothership 1e proprietary mechanics, or Call of Cthulhu 7e Chaosium-licensed text — you MUST refuse. Output **Пряма відповідь** EXACTLY as: "Це не входить у відкриту ліцензію {Ruleset}; зверніться до офіційного rulebook." — substituting the user's chosen ruleset name verbatim. Do NOT paraphrase the rule, do NOT recall it from training data, do NOT invent values, do NOT generate plausible substitutes. The other sections (Підстава у SRD, Граничні випадки, Варіанти house rule) may briefly note "Out of license scope — see Direct Answer" but must not contain rulebook content.

OUTPUT FORMAT — always use these four sections:

**Пряма відповідь:** [1–3 sentences with the SRD-consistent ruling]
**Підстава у SRD:** [the relevant rule(s), with citation and brief explanation]
**Граничні випадки:** [corner cases or ambiguous wording, if any; otherwise "Немає"]
**Варіанти house rule:** [only if SRD is silent; clearly labeled as non-SRD; otherwise "Не застосовується"]

Respond in Ukrainian. Use the Ukrainian section headers exactly as shown above.`,

  'free-chat': `You are a highly improvisational and creatively versatile Game Master Assistant. Your job is to keep session momentum alive during unexpected player moves and provide ready-to-use content the GM can slot in immediately.

RULES:
1. RAPID CONSUMPTION FORMAT — the GM is running a live session. Use bullet points, short tables, or punchy fragments. No dense paragraphs. Every item must be scannable in under 5 seconds.
2. SPECTRUM OF IDEAS — when generating lists (hooks, items, NPCs, rumors), force variance across three tiers:
   - STANDARD: 1–2 ideas that fit classic genre expectations
   - SUBVERSION: 1–2 ideas that twist or invert those tropes
   - WILDCARD: 1 idea that is bizarre, highly unconventional, or introduces strong narrative tension
3. THEMATIC CONSISTENCY — act as a genre chameleon. If the user specifies a setting and tone, never cross-pollinate genres unless explicitly asked (no steampunk in gritty low-fantasy, no comedy in grimdark horror).
4. ACTION-ORIENTED DESIGN — every generated element must have kinetic energy: loot has activation conditions or minor consequences; rumors point to specific actionable locations; NPCs have an immediate agenda; hazards require active mitigation.
5. If the user's request is underspecified (no setting, tone, or level), propose 2–3 clarifying questions OR generate content with explicit assumptions listed at the top.

Respond in Ukrainian.`,
};

const MAX_HISTORY = 10;

/**
 * S6.2 / P5.2 — Vertex Schema mirroring `NpcResponse` shape from
 * `@vtt/shared`. Passed to GeminiProvider via `responseSchema`; the SDK
 * validates the model output before returning the response, so the parsed
 * payload is guaranteed to match the keys we render in NpcCard.
 *
 * Type strings ('STRING' / 'INTEGER' / 'OBJECT') follow the Gemini Schema
 * convention (uppercase). HP/AC kept as INTEGER with documented sentinel
 * value -1 for license-bounded refusal cases (the model writes the refusal
 * sentence into `special_ability` and zeros the numeric stat-block fields).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NPC_RESPONSE_SCHEMA: Record<string, any> = {
  type: 'OBJECT',
  properties: {
    npc_core: {
      type: 'OBJECT',
      properties: {
        full_name: { type: 'STRING' },
        concept:   { type: 'STRING' },
        appearance: { type: 'STRING' },
      },
      required: ['full_name', 'concept', 'appearance'],
    },
    roleplay: {
      type: 'OBJECT',
      properties: {
        verbal_mannerism:   { type: 'STRING' },
        physical_mannerism: { type: 'STRING' },
        motivation:         { type: 'STRING' },
        sample_dialogue:    { type: 'STRING' },
      },
      required: ['verbal_mannerism', 'physical_mannerism', 'motivation', 'sample_dialogue'],
    },
    psychology: {
      type: 'OBJECT',
      properties: {
        dominant_trait: { type: 'STRING' },
        fatal_flaw:     { type: 'STRING' },
        contradiction:  { type: 'STRING' },
      },
      required: ['dominant_trait', 'fatal_flaw', 'contradiction'],
    },
    narrative: {
      type: 'OBJECT',
      properties: {
        secret:    { type: 'STRING' },
        plot_hook: { type: 'STRING' },
      },
      required: ['secret', 'plot_hook'],
    },
    statblock: {
      type: 'OBJECT',
      properties: {
        system:          { type: 'STRING' },
        cr_or_level:     { type: 'STRING' },
        hp:              { type: 'INTEGER' },
        ac:              { type: 'INTEGER' },
        speed:           { type: 'STRING' },
        primary_attack:  { type: 'STRING' },
        special_ability: { type: 'STRING' },
        assumptions:     { type: 'STRING' },
      },
      required: ['system', 'cr_or_level', 'hp', 'ac', 'speed', 'primary_attack', 'special_ability', 'assumptions'],
    },
  },
  required: ['npc_core', 'roleplay', 'psychology', 'narrative', 'statblock'],
};

/**
 * S6.2 / P5.2 — system-instruction extension appended for the NPC JSON
 * path. Tells the model the response goes back as JSON matching the
 * provided schema, and fixes the contract for license-bounded refusal
 * (sentinel hp=-1, ac=-1 + refusal sentence in `special_ability`).
 */
/**
 * S7.1 / P5.3 — system prompt for the LLM-as-prompt-generator endpoint.
 *
 * Source: AI_PROMPT_ENGINEERING_GUIDE.md §5.3 (lines 580-587). The SPECIAL
 * SKILL block is reproduced verbatim from the guide and dispatches on the
 * `[Target]` token the service injects into the user message; the model
 * picks the right formula skeleton based on the target the GM asked for.
 *
 * Output is **plain text** (not Ukrainian narrative). The draft will be
 * pasted as-is into the Image or Music modal textarea, where it feeds the
 * existing image/music providers — those providers do their own translation
 * to provider-native prompt format. No conversation persistence; no
 * session-context injection; no variables block (the modals already carry
 * setting/style/preset selectors).
 */
const PROMPT_ASSIST_SYSTEM = `You are a prompt-engineering specialist for a Virtual Tabletop AI pipeline. Your single output is a structured prompt the Game Master will paste into a generation modal — never a chat reply, never a refusal narrative, never markdown decoration.

SPECIAL SKILL: If the user asks you to generate a prompt for image generation or music,
output a structured prompt using the following format:

For IMAGE: Start with "IMAGE PROMPT:" then apply the formula:
[Subject] + [Composition] + [Style] + [Lighting] + [Color palette] + [Constraints].

For MUSIC: Start with "MUSIC PROMPT:" then apply the formula:
[Scene] + [Genre] + [Mood adjectives] + [Instrumentation] + [Tempo] + [Ambiance] + [Hard constraints: instrumental only, no vocals, no prominent beat].

RULES:
1. The user message will be tagged with "[Target: image]" or "[Target: music]" — use that exact target's formula. Do not produce both.
2. Render the formula as a single comma- or plus-separated line, plain English, no Ukrainian narrative, no headings, no preamble, no "Here's the prompt:" intro.
3. Substitute every bracketed placeholder with concrete English nouns, adjectives, or descriptive phrases drawn from the GM brief. Do not leave a placeholder un-filled.
4. For MUSIC: the hard-constraints block is mandatory — append "instrumental only, no vocals, no prominent beat" verbatim at the end even if the GM did not mention it.
5. For IMAGE: the constraints slot defaults to "no text, no watermark, no logo" when the GM gave no specific exclusion.
6. If the GM brief is too vague to fill a slot, infer the most genre-appropriate value and proceed silently — do not ask clarifying questions, do not flag uncertainty, do not produce variants.
7. Keep the total length under 80 words. The downstream image/music providers truncate aggressively beyond that.`;

const NPC_JSON_INSTRUCTION = `
OUTPUT FORMAT (JSON MODE):
- Respond with a single JSON object matching the provided schema. Do NOT output markdown headings, prose preamble, or trailing commentary — only the JSON.
- Map narrative fields verbatim into the schema:
  • npc_core.full_name, npc_core.concept (2 adjectives + 1 noun), npc_core.appearance
  • roleplay.verbal_mannerism, roleplay.physical_mannerism, roleplay.motivation, roleplay.sample_dialogue
  • psychology.dominant_trait, psychology.fatal_flaw, psychology.contradiction
  • narrative.secret, narrative.plot_hook
  • statblock.system, statblock.cr_or_level, statblock.hp (integer), statblock.ac (integer), statblock.speed, statblock.primary_attack, statblock.special_ability, statblock.assumptions
- LICENSE-BOUNDED REFUSAL: when rule 7 triggers (closed rulebook), set statblock.hp = -1, statblock.ac = -1, and put the verbatim refusal sentence "Це не входить у відкриту ліцензію {Ruleset}; зверніться до офіційного rulebook." into statblock.special_ability. Other narrative fields (npc_core / roleplay / psychology / narrative) MUST still be filled normally.
- All free-text fields remain in Ukrainian per the base instruction. Schema-key names are English by Vertex convention and must NOT be translated.`;


export class AssistantService {
  constructor(
    private readonly provider: AIProvider,
    private readonly msgRepo?: AssistantMessageRepository,
    private readonly convRepo?: AssistantConversationRepository,
    private readonly contextBuilder?: SessionContextBuilder,
    private readonly assetRepo?: AssetRepository,
  ) {}

  /**
   * Persists a single assistant message to DB. Idempotent if called
   * with same content — just creates a new row with new UUID.
   */
  /** Resolve (conversationId, context) for a saveMessage call. */
  private async resolveConversation(
    req: SaveAssistantMessageRequest,
    userId: string,
  ): Promise<{ conversationId: string; context: AssistantContext }> {
    if (req.conversationId) {
      const existing = await this.convRepo!.findById(req.conversationId);
      if (!existing) throw new Error('NOT_FOUND');
      if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
      if (existing.roomId !== req.roomId) throw new Error('FORBIDDEN');
      return {
        conversationId: existing.id,
        context: (req.context ?? existing.context) as AssistantContext,
      };
    }
    const context: AssistantContext = 'free-chat';
    let conv = await this.convRepo!.findLatestByRoomOwnerContext(req.roomId, userId, context);
    if (!conv) {
      conv = await this.convRepo!.create({
        id: randomUUID(),
        roomId: req.roomId,
        ownerId: userId,
        context,
        title: 'Default',
      });
    }
    return { conversationId: conv.id, context };
  }

  async saveMessage(
    req: SaveAssistantMessageRequest,
    userId: string | null,
  ): Promise<AssistantMessageDTO> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    if (userId === null) {
      throw new Error('saveMessage bridge requires non-null userId');
    }

    const { conversationId, context } = await this.resolveConversation(req, userId);

    const msg = await this.msgRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      userId,
      conversationId,
      context,
      role: req.role,
      content: req.content,
    });

    await this.convRepo.touch(conversationId);

    return {
      id: msg.id,
      roomId: msg.roomId,
      userId: msg.userId ?? null,
      role: msg.role as AssistantMessageDTO['role'],
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  private toConversationDTO(conv: {
    id: string; roomId: string; ownerId: string; context: string; title: string;
    createdAt: Date; updatedAt: Date;
    defaultRuleset?: string | null; defaultSetting?: string | null; defaultPlayerLevel?: number | null;
    defaultTone?: string | null; defaultOutputLanguage?: string | null;
  }): AssistantConversationDTO {
    const defaults: AssistantVariables = {};
    if (conv.defaultRuleset) defaults.ruleset = conv.defaultRuleset;
    if (conv.defaultSetting) defaults.setting = conv.defaultSetting;
    if (typeof conv.defaultPlayerLevel === 'number' && conv.defaultPlayerLevel > 0) defaults.playerLevel = conv.defaultPlayerLevel;
    if (conv.defaultTone) defaults.tone = conv.defaultTone;
    if (conv.defaultOutputLanguage) defaults.outputLanguage = conv.defaultOutputLanguage;
    return {
      id: conv.id,
      roomId: conv.roomId,
      ownerId: conv.ownerId,
      context: conv.context as AssistantConversationDTO['context'],
      title: conv.title,
      defaults,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  }

  private defaultTitleFor(context: AssistantContext): string {
    const map: Record<AssistantContext, string> = {
      'npc-description': 'Новий NPC',
      'scene-description': 'Нова сцена',
      'srd-lookup': 'SRD питання',
      'free-chat': 'Розмова',
    };
    return map[context];
  }

  /**
   * Lists all conversations the requesting user owns inside the given room.
   * Owner-scoped: a player never sees another player's threads.
   */
  async listConversations(roomId: string, userId: string): Promise<ListAssistantConversationsResponse> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const rows = await this.convRepo.findByRoomAndOwner(roomId, userId);
    return { conversations: rows.map((r) => this.toConversationDTO(r)) };
  }

  /**
   * Creates a new conversation for (roomId, userId, context).
   * Caller is responsible for verifying the user is a member of the room
   * before invoking this — the service does not consult RoomRepository.
   */
  /**
   * Clamps and projects user-supplied AssistantVariables onto the Prisma column
   * shape. Empty strings and out-of-range numbers become NULLs (omitted).
   * Pure function; pulled out of createConversation to satisfy lint complexity.
   */
  private static clampDefaults(d: AssistantVariables | undefined): {
    defaultRuleset?: string; defaultSetting?: string; defaultPlayerLevel?: number;
    defaultTone?: string; defaultOutputLanguage?: string;
  } {
    if (!d) return {};
    const norm = (s?: string, max?: number): string | undefined => {
      if (!s) return undefined;
      const t = s.trim();
      if (t.length === 0) return undefined;
      return max ? t.slice(0, max) : t;
    };
    const out: ReturnType<typeof AssistantService.clampDefaults> = {};
    const r = norm(d.ruleset, 64); if (r) out.defaultRuleset = r;
    const s = norm(d.setting, 280); if (s) out.defaultSetting = s;
    if (typeof d.playerLevel === 'number' && d.playerLevel > 0 && d.playerLevel <= 30) {
      out.defaultPlayerLevel = Math.floor(d.playerLevel);
    }
    const t = norm(d.tone, 120); if (t) out.defaultTone = t;
    const ol = norm(d.outputLanguage, 40); if (ol) out.defaultOutputLanguage = ol;
    return out;
  }

  async createConversation(
    req: CreateAssistantConversationRequest,
    userId: string,
  ): Promise<AssistantConversationDTO> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const title = req.title?.trim().slice(0, 120) || this.defaultTitleFor(req.context);
    const conv = await this.convRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      ownerId: userId,
      context: req.context,
      title,
      ...AssistantService.clampDefaults(req.defaults),
    });
    return this.toConversationDTO(conv);
  }

  /**
   * Renames a conversation. Throws on non-existent or non-owner.
   */
  async renameConversation(
    conversationId: string,
    req: RenameAssistantConversationRequest,
    userId: string,
  ): Promise<AssistantConversationDTO> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
    const title = req.title.trim().slice(0, 120);
    if (title.length === 0) throw new Error('INVALID_TITLE');
    const updated = await this.convRepo.rename(conversationId, title);
    return this.toConversationDTO(updated);
  }

  /**
   * Replaces per-conversation default variables (Phase 2a S3.1).
   * Owner-only. Empty string / 0 values clear the field; unset fields
   * preserve the current value.
   */
  async updateConversationDefaults(
    conversationId: string,
    defaults: AssistantVariables,
    userId: string,
  ): Promise<AssistantConversationDTO> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');

    const norm = (s?: string, max?: number): string | null => {
      if (s === undefined) return null;
      const t = s.trim();
      if (t.length === 0) return null;
      return max ? t.slice(0, max) : t;
    };
    const normInt = (n?: number): number | null => {
      if (typeof n !== 'number') return null;
      if (!Number.isFinite(n) || n <= 0 || n > 30) return null;
      return Math.floor(n);
    };

    const updated = await this.convRepo.updateDefaults(conversationId, {
      defaultRuleset: norm(defaults.ruleset, 64),
      defaultSetting: norm(defaults.setting, 280),
      defaultPlayerLevel: normInt(defaults.playerLevel),
      defaultTone: norm(defaults.tone, 120),
      defaultOutputLanguage: norm(defaults.outputLanguage, 40),
    });
    return this.toConversationDTO(updated);
  }

  /**
   * Deletes a conversation. Cascades to its messages via FK ON DELETE CASCADE.
   * Throws on non-existent or non-owner.
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
    await this.convRepo.delete(conversationId);
  }

  /**
   * Returns all messages of a single conversation, oldest-first.
   * Throws on non-existent or non-owner.
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
  ): Promise<AssistantHistoryResponse> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    const existing = await this.convRepo.findById(conversationId);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.ownerId !== userId) throw new Error('FORBIDDEN');
    const rows = await this.msgRepo.findByConversation(conversationId);
    return {
      messages: rows.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        userId: m.userId ?? null,
        role: m.role as AssistantMessageDTO['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Returns the markdown context block the server would inject for the given
   * conversation. Owner-scoped. Empty string when the builder is not wired.
   */
  async getContextPreview(conversationId: string, userId: string): Promise<string> {
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    if (!this.contextBuilder) return '';
    try {
      return await this.contextBuilder.build(conv.roomId, userId);
    } catch {
      return '';
    }
  }

  /**
   * Returns last 200 messages for a room (oldest-first).
   */
  async getHistory(roomId: string): Promise<AssistantHistoryResponse> {
    if (!this.msgRepo) return { messages: [] };
    const rows = await this.msgRepo.findByRoom(roomId);
    return {
      messages: rows.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        userId: m.userId ?? null,
        role: m.role as AssistantMessageDTO['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Read-only SRD rule lookup.
   * Available to all room members (GM and players). No DB write, no conversation
   * history, no session-context injection — a single-turn Q&A.
   *
   * S1.1 (2026-05-09): consolidated to reuse SYSTEM_PROMPTS['srd-lookup'] —
   * single source of truth for SRD-mode (chat + Player endpoint). The new
   * P1.3 template includes anti-hallucination "I DO NOT KNOW" protocol +
   * cross-system lock + session-context-conflict rule (harmless here since
   * lookupSRD does not inject session-context: rule fires no-op).
   */
  async lookupSRD(prompt: string): Promise<string> {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) throw new Error('INVALID_CONTENT');
    if (trimmed.length > 1000) throw new Error('INVALID_CONTENT');
    return this.provider.generateText(
      { system: SYSTEM_PROMPTS['srd-lookup'], history: [], user: trimmed },
      { thinkingLevel: 'low' },
    );
  }

  /**
   * S7.1 / P5.3 — LLM-as-prompt-generator. One-shot: GM brief → structured
   * prompt for the image or music modal. No conversation row, no message
   * log, no session-context injection.
   *
   * Caller (route layer) is responsible for GM-only RBAC; the service only
   * validates input shape. Mirrors the contract of `lookupSRD`.
   */
  async generatePromptDraft(req: PromptAssistRequest): Promise<PromptAssistResponse> {
    const trimmed = req.userPrompt.trim();
    if (trimmed.length === 0) throw new Error('INVALID_CONTENT');
    if (trimmed.length > 1000) throw new Error('INVALID_CONTENT');
    const target: PromptAssistTarget = req.target === 'music' ? 'music' : 'image';
    const taggedUser = `[Target: ${target}]\n\n${trimmed}`;
    const draft = await this.provider.generateText(
      { system: PROMPT_ASSIST_SYSTEM, history: [], user: taggedUser },
      { thinkingLevel: 'low' },
    );
    return { draft };
  }

  /**
   * Returns AI usage stats for a room — image/audio/LLM counts last-24h + totals.
   * Called by GET /api/ai/quota. Caller is responsible for member-of-room RBAC.
   * Returns zeros for any wing whose repo isn't wired (graceful in tests).
   */
  async getRoomQuota(roomId: string): Promise<AIQuotaResponse> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const zero = Promise.resolve(0);
    const [imgs24, imgsTotal, aud24, audTotal, msgs24] = await Promise.all([
      this.assetRepo ? this.assetRepo.countByRoomAndSourceSince(roomId, 'AI_IMAGE', since) : zero,
      this.assetRepo ? this.assetRepo.countByRoomAndSource(roomId, 'AI_IMAGE') : zero,
      this.assetRepo ? this.assetRepo.countByRoomAndSourceSince(roomId, 'AI_AUDIO', since) : zero,
      this.assetRepo ? this.assetRepo.countByRoomAndSource(roomId, 'AI_AUDIO') : zero,
      this.msgRepo ? this.msgRepo.countUserMessagesByRoomSince(roomId, since) : zero,
    ]);
    return {
      images: { last24h: imgs24, total: imgsTotal },
      audio: { last24h: aud24, total: audTotal },
      llm: { messagesLast24h: msgs24 },
    };
  }

  /**
   * Maps a Prisma `AssistantConversation` row (with nullable default* columns)
   * to a clean `AssistantVariables` shape (omits unset fields).
   * Phase 2a S3.1.
   */
  static convToVars(conv: {
    defaultRuleset?: string | null; defaultSetting?: string | null;
    defaultPlayerLevel?: number | null; defaultTone?: string | null;
    defaultOutputLanguage?: string | null;
  }): AssistantVariables {
    const out: AssistantVariables = {};
    if (conv.defaultRuleset) out.ruleset = conv.defaultRuleset;
    if (conv.defaultSetting) out.setting = conv.defaultSetting;
    if (typeof conv.defaultPlayerLevel === 'number' && conv.defaultPlayerLevel > 0) out.playerLevel = conv.defaultPlayerLevel;
    if (conv.defaultTone) out.tone = conv.defaultTone;
    if (conv.defaultOutputLanguage) out.outputLanguage = conv.defaultOutputLanguage;
    return out;
  }

  /**
   * Resolves the effective per-call AssistantVariables (Phase 2a S3.1).
   * Priority: per-request value > per-conversation default > undefined.
   * Empty strings and `playerLevel === 0` are coerced to undefined.
   */
  static resolveVariables(req: AssistantVariables, convDefaults?: AssistantVariables): AssistantVariables {
    const out: AssistantVariables = {};
    const pickStr = (a?: string, b?: string): string | undefined => {
      const v = (a && a.trim().length > 0) ? a : (b && b.trim().length > 0) ? b : undefined;
      return v;
    };
    const pickInt = (a?: number, b?: number): number | undefined => {
      const v = (typeof a === 'number' && a > 0) ? a : (typeof b === 'number' && b > 0) ? b : undefined;
      return v;
    };
    const r = pickStr(req.ruleset, convDefaults?.ruleset); if (r) out.ruleset = r;
    const s = pickStr(req.setting, convDefaults?.setting); if (s) out.setting = s;
    const pl = pickInt(req.playerLevel, convDefaults?.playerLevel); if (pl) out.playerLevel = pl;
    const t = pickStr(req.tone, convDefaults?.tone); if (t) out.tone = t;
    const ol = pickStr(req.outputLanguage, convDefaults?.outputLanguage); if (ol) out.outputLanguage = ol;
    return out;
  }

  /**
   * Builds the per-prompt variables block.
   * Returns "" if no variables set — zero overhead for vacuum requests.
   */
  static buildVariablesBlock(vars: AssistantVariables): string {
    const lines: string[] = [];
    if (vars.ruleset) lines.push(`- Ruleset: ${vars.ruleset}`);
    if (vars.setting) lines.push(`- Setting: ${vars.setting}`);
    if (vars.playerLevel) lines.push(`- Player level: ${vars.playerLevel}`);
    if (vars.tone) lines.push(`- Tone: ${vars.tone}`);
    if (vars.outputLanguage) lines.push(`- Output language: ${vars.outputLanguage}`);
    if (lines.length === 0) return '';
    return `\n\n--- Session variables ---\n${lines.join('\n')}\n--- /Session variables ---\n`;
  }

  async generateAssistantText(req: AssistantTextRequest): Promise<AssistantTextResponse> {
    const vars = AssistantService.resolveVariables(req);
    const history = (req.conversationHistory ?? []).slice(-MAX_HISTORY);
    const parts = AssistantService.buildPromptParts(req.context, history, req.userPrompt, undefined, vars);
    const content = await this.provider.generateText(parts, { thinkingLevel: req.thinkingLevel ?? 'low' });
    return { content };
  }

  /**
   * Streams chunks from the provider, accumulates them, then persists the
   * completed assistant message. Returns false if aborted before completion.
   *
   * S6.2 — when `conv.context === 'npc-description'`, branches to the
   * non-streaming JSON path (`runJsonNpcAndSave`) since structured JSON must
   * arrive atomically before validation.
   */
  private async streamAndSave(
    parts: TextGenerationRequest,
    userMessageId: string,
    conv: { id: string; roomId: string; context: string },
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    if (conv.context === 'npc-description') {
      return this.runJsonNpcAndSave(parts, userMessageId, conv, userId, emit, signal);
    }
    emit({ type: 'start', userMessageId });
    let accumulated = '';
    for await (const chunk of this.provider.generateTextStream(parts, signal, { thinkingLevel: 'low' })) {
      if (signal?.aborted) return false;
      accumulated += chunk;
      emit({ type: 'chunk', delta: chunk });
    }
    if (signal?.aborted) return false;
    const assistantMsg = await this.msgRepo!.create({
      id: randomUUID(),
      roomId: conv.roomId,
      userId,
      conversationId: conv.id,
      context: conv.context,
      role: 'assistant',
      content: accumulated,
    });
    await this.convRepo!.touch(conv.id);
    emit({ type: 'done', assistantMessageId: assistantMsg.id, content: accumulated });
    return true;
  }

  /**
   * S6.2 / P5.2 — non-streaming JSON path for `context === 'npc-description'`.
   *
   * Vertex `responseMimeType: 'application/json'` + `responseSchema` returns
   * the entire object atomically; we parse + re-serialize (canonicalising
   * whitespace and dropping any wrapper text the model might prefix). The
   * stored `content` is the canonical JSON string — the client tries
   * JSON.parse on render and falls back to markdown when parsing fails
   * (legacy npc messages or future text-mode regressions).
   *
   * SSE contract: emits `start` → single `chunk` (full JSON) → `done`.
   * Frontend stream handler treats this exactly like a one-shot reply.
   */
  private async runJsonNpcAndSave(
    parts: TextGenerationRequest,
    userMessageId: string,
    conv: { id: string; roomId: string; context: string },
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    emit({ type: 'start', userMessageId });
    if (signal?.aborted) return false;

    const jsonParts: TextGenerationRequest = {
      ...parts,
      system: `${parts.system}\n${NPC_JSON_INSTRUCTION}`,
      responseMimeType: 'application/json',
      responseSchema: NPC_RESPONSE_SCHEMA,
    };
    const raw = await this.provider.generateText(jsonParts, { thinkingLevel: 'low' });
    if (signal?.aborted) return false;

    // Canonicalise: even though Vertex JSON mode + schema returns valid JSON,
    // serialise back through JSON.parse/stringify to drop any whitespace
    // variance (and to fail loudly here rather than at render time).
    let canonical: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = JSON.parse(raw) as Record<string, any>;
      canonical = JSON.stringify(parsed);
    } catch {
      // Schema-mode parse failure is rare but possible (e.g. truncated
      // response); persist the raw text so the GM can still see what came
      // back, and let the client fall back to markdown rendering.
      canonical = raw;
    }

    const assistantMsg = await this.msgRepo!.create({
      id: randomUUID(),
      roomId: conv.roomId,
      userId,
      conversationId: conv.id,
      context: conv.context,
      role: 'assistant',
      content: canonical,
    });
    await this.convRepo!.touch(conv.id);
    emit({ type: 'chunk', delta: canonical });
    emit({ type: 'done', assistantMessageId: assistantMsg.id, content: canonical });
    return true;
  }

  /**
   * Builds the role-split LLM prompt parts (Phase 2a S6.1).
   *
   * Composition:
   *   - system instruction = SYSTEM_PROMPTS[context] + variables_block? + session_context_block?
   *     (variables and session-context are framing context, not user input —
   *     they belong on the system role per Vertex SDK convention)
   *   - history = oldest-first array of past user/assistant turns
   *   - user = current user prompt (sent as the last `role: 'user'` content turn)
   *
   * Replaces the pre-S6.1 `buildPrompt(): string` which concatenated everything
   * into one flat string and exposed the system instruction to history-spoof
   * attacks at the prompt level.
   */
  static buildPromptParts(
    context: AssistantContext,
    history: ReadonlyArray<{ role: string; content: string }>,
    userPrompt: string,
    sessionContext?: string,
    vars?: AssistantVariables,
  ): TextGenerationRequest {
    const baseSystem = SYSTEM_PROMPTS[context];
    const varsBlock = vars ? AssistantService.buildVariablesBlock(vars) : '';
    const ctxBlock = sessionContext && sessionContext.trim().length > 0
      ? `\n\n--- Контекст сесії ---\n${sessionContext}\n--- /Контекст сесії ---\n`
      : '';
    return {
      system: `${baseSystem}${varsBlock}${ctxBlock}`,
      history: history.map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      })),
      user: userPrompt,
    };
  }

  private async fetchSessionContext(
    roomId: string,
    userId: string,
    enabled: boolean,
  ): Promise<string> {
    if (!enabled || !this.contextBuilder) return '';
    try {
      return await this.contextBuilder.build(roomId, userId);
    } catch {
      // Builder failure must not break AI generation — degrade silently.
      return '';
    }
  }

  /**
   * Streams an assistant reply via SSE while persisting both messages atomically:
   * the user message is saved before the stream starts (so partial completions
   * leave a record), the assistant message is saved only when the stream finishes
   * normally. On AbortSignal trip — partial assistant content is discarded.
   */
  async streamAndPersist(
    req: AssistantStreamRequest,
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');

    // 1. Verify ownership.
    const conv = await this.convRepo.findById(req.conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    if (conv.roomId !== req.roomId) throw new Error('FORBIDDEN');

    // 2. Persist user message.
    const userMsg = await this.msgRepo.create({
      id: randomUUID(),
      roomId: req.roomId,
      userId,
      conversationId: req.conversationId,
      context: req.context,
      role: 'user',
      content: req.userPrompt,
    });

    // 3. Build prompt from conversation history (excluding the just-saved user message).
    const allMsgs = await this.msgRepo.findByConversation(req.conversationId);
    const history = allMsgs.filter((m) => m.id !== userMsg.id).slice(-10);
    const sessionCtx = await this.fetchSessionContext(
      req.roomId,
      userId,
      req.useSessionContext !== false, // default true when undefined
    );
    const vars = AssistantService.resolveVariables(req, AssistantService.convToVars(conv));
    const parts = AssistantService.buildPromptParts(req.context as AssistantContext, history, req.userPrompt, sessionCtx, vars);

    // 4. Branch: NPC mode → JSON path; everything else → streaming.
    //    streamAndSave already encapsulates both branches (S6.2), so reuse it.
    await this.streamAndSave(parts, userMsg.id, conv, userId, emit, signal);
  }

  /**
   * Regenerates the last assistant reply of a conversation.
   * Drops the last assistant message (if any), then re-streams a fresh reply
   * based on history up through the last user message.
   */
  async regenerateAndStream(
    conversationId: string,
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');

    const conv = await this.convRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');

    const all = await this.msgRepo.findByConversation(conversationId);
    // Find last user message — that's the prompt to re-send.
    let lastUser: { id: string; content: string; createdAt: Date } | null = null;
    for (let i = all.length - 1; i >= 0; i--) {
      const m = all[i];
      if (m && m.role === 'user') {
        lastUser = { id: m.id, content: m.content, createdAt: m.createdAt };
        break;
      }
    }
    if (!lastUser) throw new Error('NO_USER_MESSAGE');

    // Drop everything after the last user message (the previous assistant reply, if any).
    await this.msgRepo.deleteAfter(conversationId, lastUser.createdAt);

    // Build prompt from history strictly BEFORE the last user message.
    const history = all.filter((m) => m.createdAt < lastUser!.createdAt).slice(-10);
    const sessionCtx = await this.fetchSessionContext(conv.roomId, userId, true);
    const vars = AssistantService.resolveVariables({}, AssistantService.convToVars(conv));
    const parts = AssistantService.buildPromptParts(conv.context as AssistantContext, history, lastUser.content, sessionCtx, vars);

    await this.streamAndSave(parts, lastUser.id, conv, userId, emit, signal);
  }

  /**
   * Edit-and-resend: replace the content of a user-role message, drop everything
   * created strictly after it (replies + later turns), then stream a fresh
   * assistant reply.
   */
  async editAndStream(
    conversationId: string,
    messageId: string,
    newContent: string,
    userId: string,
    emit: (event: AssistantStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.msgRepo) throw new Error('AssistantMessageRepository not wired');
    if (!this.convRepo) throw new Error('AssistantConversationRepository not wired');

    const conv = await this.convRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');

    const target = await this.msgRepo.findById(messageId);
    if (!target) throw new Error('NOT_FOUND');
    if (target.conversationId !== conversationId) throw new Error('FORBIDDEN');
    if (target.role !== 'user') throw new Error('INVALID_TARGET');

    const trimmed = newContent.trim();
    if (trimmed.length === 0) throw new Error('INVALID_CONTENT');

    // 1. Update the user message in place.
    await this.msgRepo.update(messageId, trimmed);
    // 2. Drop everything after it.
    await this.msgRepo.deleteAfter(conversationId, target.createdAt);

    // 3. Build prompt from history strictly BEFORE the edited message.
    const all = await this.msgRepo.findByConversation(conversationId);
    const history = all.filter((m) => m.createdAt < target.createdAt).slice(-10);
    const sessionCtx = await this.fetchSessionContext(conv.roomId, userId, true);
    const vars = AssistantService.resolveVariables({}, AssistantService.convToVars(conv));
    const parts = AssistantService.buildPromptParts(conv.context as AssistantContext, history, trimmed, sessionCtx, vars);

    await this.streamAndSave(parts, messageId, conv, userId, emit, signal);
  }
}

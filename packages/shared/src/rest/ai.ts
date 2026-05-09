export type AssistantContext = 'npc-description' | 'scene-description' | 'srd-lookup' | 'free-chat';

// ---------- P5.2 / S6.2 — JSON-structured NPC output ----------

/**
 * Shape returned by the assistant when `context === 'npc-description'`.
 * Mirrors AI_PROMPT_ENGINEERING_GUIDE.md §5.2 schema. Stored in
 * `ConversationMessage.content` as a JSON string; client parses on render
 * and falls back to markdown if parsing fails.
 */
export interface NpcResponse {
  npc_core: {
    full_name: string;
    /** Concept = "2 adjectives + 1 noun" (e.g. "world-weary stoic guardian"). */
    concept: string;
    appearance: string;
  };
  roleplay: {
    verbal_mannerism: string;
    physical_mannerism: string;
    motivation: string;
    sample_dialogue: string;
  };
  psychology: {
    dominant_trait: string;
    fatal_flaw: string;
    /** Explicit clash between strength and flaw. */
    contradiction: string;
  };
  narrative: {
    secret: string;
    plot_hook: string;
  };
  statblock: {
    /** Ruleset name as declared/assumed by the assistant. */
    system: string;
    /** "CR 1/2", "Level 5", or refusal sentinel for closed-license rulebooks. */
    cr_or_level: string;
    /** Hit points; -1 sentinel when license-bounded refusal applies. */
    hp: number;
    /** Armour class; -1 sentinel when license-bounded refusal applies. */
    ac: number;
    speed: string;
    primary_attack: string;
    special_ability: string;
    assumptions: string;
  };
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Per-message and per-conversation prompt variables (Session 3.1, P4 backend).
 *
 * Resolution priority: per-request value > per-conversation default >
 * SYSTEM_PROMPTS-baked default (Ukrainian language, D&D 5e ruleset for NPC/SRD).
 *
 * All fields optional. Empty string treated as "not set". `playerLevel === 0`
 * also treated as "not set" (resolveVariables coerces). When all fields
 * resolve to undefined, no `--- Session variables ---` block is injected.
 *
 * Source: AI_PROMPT_ENGINEERING_GUIDE.md §4.1.
 */
export interface AssistantVariables {
  /** TTRPG ruleset name e.g. "D&D 5e (2014 SRD)", "Pathfinder 2e", "Shadowdark", "Custom". Max 64 chars. */
  ruleset?: string;
  /** World/setting flavor e.g. "post-apocalyptic desert wasteland". Max 280 chars. */
  setting?: string;
  /** Party level for stat-block scaling. Integer 1..30. */
  playerLevel?: number;
  /** Tonal direction e.g. "grimdark and morally gray". Max 120 chars. */
  tone?: string;
  /** Output language name e.g. "Ukrainian", "English". Max 40 chars. NOTE in S3.1 the
   *  `Respond in Ukrainian` directive baked into SYSTEM_PROMPTS still wins; this field
   *  is shipped for future use when SYSTEM_PROMPTS becomes language-parameterized. */
  outputLanguage?: string;
}

export interface AssistantTextRequest extends AssistantVariables {
  roomId: string;
  context: AssistantContext;
  userPrompt: string;
  conversationHistory?: ConversationMessage[];
  /** When 'high', server sets Gemini 3's thinking_level to 'high' for deeper
   *  but slower (and more expensive) reasoning. Default 'low'. Ignored for
   *  models that don't support thinking_level. */
  thinkingLevel?: 'low' | 'high';
}

export interface AssistantTextResponse {
  content: string;
}

// ---------- AI message persistence (Ф8.1 — LEV-MANUAL-004) ----------

export interface AssistantMessageDTO {
  id: string;
  roomId: string;
  userId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface SaveAssistantMessageRequest {
  roomId: string;
  role: 'user' | 'assistant';
  content: string;
  /** When present, the message is saved into this conversation. When absent, the
   *  service falls back to a default `free-chat` conversation per (room, owner). */
  conversationId?: string;
  /** Denormalised context. Required when `conversationId` is provided. */
  context?: AssistantContext;
}

export interface AssistantHistoryResponse {
  messages: AssistantMessageDTO[];
}

export interface AssistantConversationDTO {
  id: string;
  roomId: string;
  ownerId: string;
  context: AssistantContext;
  title: string;
  /** Per-conversation default variables (Session 3.1 / Phase 2a P4).
   *  When the user sends a request with empty AssistantVariables, the server
   *  falls back to these. Empty object `{}` means no defaults are set. */
  defaults: AssistantVariables;
  createdAt: string;
  updatedAt: string;
}

// ---------- Conversation management requests/responses (Session 3.1) ----------

export interface CreateAssistantConversationRequest {
  roomId: string;
  context: AssistantContext;
  title?: string;
  /** Optional initial defaults stored on the conversation row. */
  defaults?: AssistantVariables;
}

export interface RenameAssistantConversationRequest {
  title: string;
}

/** PATCH /ai/conversations/:id/defaults — full-replace semantics (Session 3.1). */
export interface UpdateConversationDefaultsRequest {
  defaults: AssistantVariables;
}

export interface ListAssistantConversationsResponse {
  conversations: AssistantConversationDTO[];
}

// ---------- AI error taxonomy (Session 1.2) ----------

/**
 * Discriminator returned by the server for any AI-related failure.
 * Frontend (Session 2.1) switches on this to render localized messages.
 */
export type AIErrorKind =
  | 'ai_quota'           // 503 — provider rate-limited or budget exhausted
  | 'ai_safety'          // 422 — safety classifier blocked prompt or response
  | 'ai_invalid_prompt'  // 400 — provider rejected prompt syntactically / no candidates
  | 'ai_network'         // 504 — provider unreachable (timeout / transport)
  | 'ai_unknown';        // 500 — unhandled error path

export interface AIErrorResponse {
  error: {
    code: number;
    kind: AIErrorKind;
    message: string;
  };
}

// ---------- SSE streaming events (Session 4.1) ----------

export type AssistantStreamEvent =
  | { type: 'start'; userMessageId: string }
  | { type: 'chunk'; delta: string }
  | { type: 'done'; assistantMessageId: string; content: string }
  | { type: 'error'; kind: AIErrorKind; message: string };

export interface AssistantStreamRequest extends AssistantVariables {
  roomId: string;
  conversationId: string;
  context: AssistantContext;
  userPrompt: string;
  /**
   * When true (default), the server prepends a markdown block describing
   * the active scene, initiative state, player characters, and recent chat
   * to the system prompt. Set false to opt out for a "vacuum" answer.
   */
  useSessionContext?: boolean;
  /** When 'high', server sets Gemini 3's thinking_level to 'high' for deeper
   *  but slower (and more expensive) reasoning. Default 'low'. Ignored for
   *  models that don't support thinking_level. */
  thinkingLevel?: 'low' | 'high';
}

export interface AssistantContextPreviewResponse {
  /** The exact markdown block that would be injected if the user sends a message
   *  with `useSessionContext: true`. Empty string when the builder is not wired
   *  or the room has no relevant state. */
  text: string;
}

// ---------- Player SRD lookup (Session 6.1, M10) ----------

export interface SRDLookupRequest {
  /** The room context — used for RBAC (member-of-room check). */
  roomId: string;
  /** The rule question. */
  prompt: string;
}

export interface SRDLookupResponse {
  content: string;
}

// ---------- AI usage quota (Session 6.3.B) ----------

export interface AIQuotaResponse {
  /** AI-image assets generated in this room. */
  images: { last24h: number; total: number };
  /** AI-audio assets generated in this room. */
  audio: { last24h: number; total: number };
  /** LLM activity — count of user-role messages saved in the last 24h
   *  (proxy for "AI text requests"; we don't track tokens at this stage). */
  llm: { messagesLast24h: number };
}

// ---------- Prompt-assist (Session 7.1, P5.3 LLM-as-prompt-generator) ----------

/**
 * Where the generated draft will be pasted next. Drives the output formula
 * baked into PROMPT_ASSIST_SYSTEM (image vs music have different field
 * skeletons per AI_PROMPT_ENGINEERING_GUIDE.md §5.3).
 */
export type PromptAssistTarget = 'image' | 'music';

/**
 * One-shot LLM call: GM writes a natural-language brief, gets back a
 * structured prompt for the relevant Image/Music modal. No conversation
 * persistence — `prompt-assist` is route-local and never enters the
 * `AssistantContext` union (no DB conversation row, no message log).
 *
 * RBAC: GM-only — the only consumers (image + music routes) are GM-gated,
 * so authorising members would burn LLM budget on an unusable draft.
 */
export interface PromptAssistRequest {
  /** RBAC scope. */
  roomId: string;
  target: PromptAssistTarget;
  /** GM brief, max 1000 chars. Empty/oversize → 400 ai_invalid_prompt. */
  userPrompt: string;
}

export interface PromptAssistResponse {
  /** Plain-text draft the client pastes into the Image or Music modal. */
  draft: string;
}

// ---------- Image conversations (Session 7.1, Nano Banana 2) ----------

export interface AssistantImageConversationDTO {
  id: string;
  roomId: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantImageTurnDTO {
  id: string;
  conversationId: string;
  turnIndex: number;
  userPrompt: string;
  generatedAssetId: string | null;
  /** Signed presigned URL of the generated image (TTL 4h). Null if asset missing. */
  generatedAssetUrl: string | null;
  referenceAssetIds: string[];
  /** Signed presigned URLs of reference assets, in the same order as `referenceAssetIds`. */
  referenceAssetUrls: string[];
  createdAt: string;
}

export interface CreateImageConversationRequest {
  roomId: string;
  title?: string;
}

export interface RenameImageConversationRequest {
  title: string;
}

export interface ContinueImageConversationRequest {
  prompt: string;
  referenceAssetIds?: string[];
}

export interface ContinueImageConversationResponse {
  turnId: string;
  turnIndex: number;
  generatedAssetId: string;
  generatedAssetUrl: string;
}

export interface ListImageConversationsResponse {
  conversations: AssistantImageConversationDTO[];
}

export interface ListImageTurnsResponse {
  turns: AssistantImageTurnDTO[];
}

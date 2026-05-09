import type { AIImageRequest, AIMusicRequest } from '@vtt/shared';

/**
 * Strategy abstraction over external generative models (§2.13.3, §2.13.4).
 * Concrete strategies: GeminiProvider (Gemini Flash 3 Preview / Gemini 3.1 Flash Image / Lyria 3).
 *
 * The interface returns raw bytes + mimeType, decoupling model output from
 * persistence: AssetService is responsible for storing bytes via FileStorageAdapter
 * and recording metadata via AssetRepository (sequence diagram А.7).
 */
export interface GeneratedBinary {
  bytes: Buffer;
  mimeType: string;
}

export interface ImageTurnHistoryEntry {
  role: 'user' | 'model';
  /** Present on user-prompt turns or on user reference-attachments. */
  text?: string;
  /** Present on assistant-output turns AND on user reference-attachments. */
  imageBytes?: Buffer;
  mimeType?: string;
}

export interface ImageMultiTurnRequest {
  /** Conversation history, oldest-first, INCLUDING reference attachments
   *  but NOT including the current new prompt (which is `nextPrompt`). */
  history: ImageTurnHistoryEntry[];
  nextPrompt: string;
  /** Reference assets to attach to the *current* user turn, sent as
   *  inline data parts immediately before the text. */
  references?: ReadonlyArray<{ bytes: Buffer; mimeType: string }>;
}

/**
 * Phase 2a S6.1 — proper role-split for text generation.
 *
 * The provider receives:
 *   - `system`: the system instruction text (system role; immovable from
 *     the model's perspective)
 *   - `history`: oldest-first array of past user/assistant turns
 *   - `user`: the current user prompt
 *
 * Implementations map this to Vertex SDK's `systemInstruction` parameter +
 * `contents` array of {role, parts} content turns. The assistant role in
 * Vertex is named `model`; provider implementations translate
 * 'assistant' → 'model' at the boundary.
 */
export interface TextGenerationRequest {
  /** System-instruction text (one block, may contain newlines). */
  system: string;
  /** Conversation history, oldest-first. */
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  /** Current user prompt — sent as the last `role: 'user'` content turn. */
  user: string;
  /**
   * S6.2 / P5.2 — when 'application/json', the model is asked to return
   * structured JSON. Used by NPC mode to populate `NpcResponse` directly.
   * Streaming variant ignores this (JSON must come back atomically).
   */
  responseMimeType?: 'application/json';
  /**
   * S6.2 / P5.2 — Vertex SDK Schema (Type:'OBJECT' tree) describing the
   * exact JSON shape the model must produce. Without it the model still
   * emits JSON but with free-form keys; with it the SDK validates the
   * response server-side before the byte stream returns.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseSchema?: Record<string, any>;
}

export interface AIProvider {
  /** Text generation — LLM assistant (Ф8.1). */
  generateText(req: TextGenerationRequest, opts?: { thinkingLevel?: 'low' | 'high' }): Promise<string>;

  /**
   * Streaming variant of `generateText` (Ф8.1, Session 4.1).
   * Yields content deltas as they arrive from the upstream model.
   * Honors the optional AbortSignal — implementations must stop iteration
   * when `signal.aborted === true` (used to free resources on client disconnect).
   *
   * Errors are wrapped via the same taxonomy as `generateText`
   * (AIQuotaError / AISafetyError / AIInvalidPromptError / AINetworkError).
   */
  generateTextStream(req: TextGenerationRequest, signal?: AbortSignal, opts?: { thinkingLevel?: 'low' | 'high' }): AsyncIterable<string>;

  /** Image generation — scene illustration (Ф8.2). */
  generateImage(req: AIImageRequest): Promise<GeneratedBinary>;

  /** P2.2 — Token image generation with character-specific constraints (S4.2). */
  generateToken(req: AIImageRequest): Promise<GeneratedBinary>;

  /** P2.3 — Battlemap image generation with orthographic top-down constraints (S4.3). */
  generateBattlemap(req: AIImageRequest): Promise<GeneratedBinary>;

  /**
   * Multi-turn image generation (Session 7.1, Nano Banana 2).
   * Sends a sequence of past (user-prompt, generated-image-bytes) turns
   * plus optional reference-image bytes as visual context, then a new
   * user prompt — receives the next image in the conversation.
   *
   * Each prior turn is `{ role: 'user' | 'model', text?: string, imageBytes?: Buffer, mimeType?: string }`.
   * The model integrates these into its chat history; we don't persist
   * SDK state — we rebuild it from our own `AssistantImageTurn` rows.
   */
  generateImageMultiTurn(
    req: ImageMultiTurnRequest,
    signal?: AbortSignal,
  ): Promise<GeneratedBinary>;

  /**
   * Music generation — ambient audio loop (Ф8.3).
   *
   * Returns the binary plus the `composedPrompt` actually sent to the model
   * (assembled from preset + structured fields). Persisted as Asset.aiPrompt
   * so the history view shows the real, full prompt rather than the empty
   * legacy `req.prompt` field.
   */
  generateMusic(req: AIMusicRequest): Promise<GeneratedBinary & { composedPrompt: string }>;
}

/**
 * Thrown when the upstream model returns 429 / 5xx (sequence А.7, alt-branch).
 * Mapped by the route layer to HTTP 503 (НФВ 4.5, T10 STRIDE).
 */
export class AIQuotaError extends Error {
  constructor(message = 'AI provider quota exceeded') {
    super(message);
    this.name = 'AIQuotaError';
  }
}

/**
 * Thrown when the upstream model refused to produce content because of a
 * safety filter (prompt or response was blocked by Vertex AI safety classifiers).
 * Mapped to HTTP 422 — the request was understood but the content policy
 * forbids the action. Frontend should suggest the user rephrase.
 */
export class AISafetyError extends Error {
  constructor(message = 'AI provider blocked the request for safety reasons') {
    super(message);
    this.name = 'AISafetyError';
  }
}

/**
 * Thrown when the upstream model returned an empty / malformed payload for a
 * reason other than safety (e.g. the prompt was syntactically rejected by
 * Vertex with INVALID_ARGUMENT or the SDK returned no candidates).
 * Mapped to HTTP 400 — the prompt is the problem.
 */
export class AIInvalidPromptError extends Error {
  constructor(message = 'AI provider rejected the prompt as invalid') {
    super(message);
    this.name = 'AIInvalidPromptError';
  }
}

/**
 * Thrown when the upstream call failed at the network layer (timeout, DNS,
 * TCP reset, TLS) before Vertex returned any payload.
 * Mapped to HTTP 504 — gateway timeout / upstream unreachable.
 */
export class AINetworkError extends Error {
  constructor(message = 'AI provider unreachable') {
    super(message);
    this.name = 'AINetworkError';
  }
}

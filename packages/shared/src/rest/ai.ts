export type AssistantContext = 'npc-description' | 'scene-description' | 'srd-lookup' | 'free-chat';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantTextRequest {
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
  createdAt: string;
  updatedAt: string;
}

// ---------- Conversation management requests/responses (Session 3.1) ----------

export interface CreateAssistantConversationRequest {
  roomId: string;
  context: AssistantContext;
  title?: string;
}

export interface RenameAssistantConversationRequest {
  title: string;
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

export interface AssistantStreamRequest {
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

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
}

export interface AssistantHistoryResponse {
  messages: AssistantMessageDTO[];
}

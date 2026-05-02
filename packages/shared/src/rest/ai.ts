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

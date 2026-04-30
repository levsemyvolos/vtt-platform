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

export interface AIProvider {
  /** Text generation — LLM assistant (Ф8.1). */
  generateText(prompt: string): Promise<string>;

  /** Image generation — scene illustration (Ф8.2). */
  generateImage(req: AIImageRequest): Promise<GeneratedBinary>;

  /** Music generation — ambient audio loop (Ф8.3). */
  generateMusic(req: AIMusicRequest): Promise<GeneratedBinary>;
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

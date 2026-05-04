import type { AIProvider, GeneratedBinary } from './AIProvider.js';
import { AIQuotaError } from './AIProvider.js';

export class DisabledAIProvider implements AIProvider {
  generateText(): Promise<string> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateImage(): Promise<GeneratedBinary> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateMusic(): Promise<GeneratedBinary> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }
}

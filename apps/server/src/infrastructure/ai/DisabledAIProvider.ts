import type { AIProvider, GeneratedBinary } from './AIProvider.js';
import { AIQuotaError } from './AIProvider.js';

export class DisabledAIProvider implements AIProvider {
  generateText(): Promise<string> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateTextStream(): AsyncIterable<string> {
    const err = new AIQuotaError('AI provider is not configured');
    return {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        return {
          next(): Promise<IteratorResult<string>> {
            return Promise.reject(err);
          },
        };
      },
    };
  }

  generateImage(): Promise<GeneratedBinary> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateToken(): Promise<GeneratedBinary> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateBattlemap(): Promise<GeneratedBinary> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateImageMultiTurn(): Promise<GeneratedBinary> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }

  generateMusic(): Promise<GeneratedBinary & { composedPrompt: string }> {
    return Promise.reject(new AIQuotaError('AI provider is not configured'));
  }
}

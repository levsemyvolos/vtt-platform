import type {
  AIImageRequest,
  AIImageResponse,
  AIMusicRequest,
  AIMusicResponse,
} from '@vtt/shared';
import type { AIProvider } from '../infrastructure/ai/AIProvider.js';
import { AssetService } from './AssetService.js';

/**
 * Use-case service for Ф8 (AI tooling). Composes AIProvider with AssetService
 * per Process_View_AIImage (sequence А.7).
 *
 * Errors from AIProvider (`AIQuotaError`) are propagated unchanged; the route
 * layer maps them to HTTP 503 (НФВ 4.5, T10 STRIDE).
 */
export class AIService {
  constructor(
    private readonly provider: AIProvider,
    private readonly assets: AssetService,
  ) {}

  /**
   * Ф8.2 — generate scene illustration and persist as Asset.
   * @param userId requesting user
   * @param req prompt + roomId (+ style)
   * @returns previewUrl (presigned, TTL 15 min) + assetId
   */
  async generateImage(userId: string, req: AIImageRequest): Promise<AIImageResponse> {
    const payload = await this.provider.generateImage(req);
    const asset = await this.assets.storeAiAsset(userId, req.roomId, payload, 'image');
    const previewUrl = await this.assets.presignedUrlFor(asset.storageKey);
    return { previewUrl, assetId: asset.id };
  }

  /**
   * Ф8.3 — generate ambient music loop.
   */
  async generateMusic(userId: string, req: AIMusicRequest): Promise<AIMusicResponse> {
    const payload = await this.provider.generateMusic(req);
    const asset = await this.assets.storeAiAsset(userId, req.roomId, payload, 'audio');
    const previewUrl = await this.assets.presignedUrlFor(asset.storageKey);
    return { previewUrl, assetId: asset.id };
  }

  /** Ф8.1 — text generation (LLM assistant). */
  generateText(prompt: string): Promise<string> {
    return this.provider.generateText(prompt);
  }
}

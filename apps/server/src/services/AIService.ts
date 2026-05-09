import type {
  AIImageRequest,
  AIImageResponse,
  AIMusicRequest,
  AIMusicResponse,
  MusicPresetKey,
} from '@vtt/shared';
import type { AIProvider, TextGenerationRequest } from '../infrastructure/ai/AIProvider.js';
import { AssetService } from './AssetService.js';

/**
 * Human-readable display name shown in history/sidebar lists for AI music.
 *
 * Lyria's `/interactions` response carries no `name` / `title` field — only
 * raw audio bytes — so the title must be derived from the request fields.
 * Strategy (S5.5 P1, after user feedback "AI:" rows had no name):
 *   1. First 1-2 words of `mood` (the most descriptive user-supplied input)
 *   2. Preset label as a fallback when mood is empty
 *   3. First 1-2 words of free-form `prompt` (legacy non-preset path)
 *   4. Hard fallback "AI Music"
 *
 * Cap at 64 chars defensively even though the column allows 128 — the
 * sidebar renders titles in ~20-char column.
 */
const MUSIC_PRESET_LABELS: Record<MusicPresetKey, string> = {
  cave: 'Cave',
  tavern: 'Tavern',
  exploration: 'Exploration',
  tension: 'Tension',
  combat: 'Combat',
};

function firstTwoWordsTitleCase(s: string): string {
  const words = s
    .split(/[\s,.;:!?\-\/]+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ');
}

export function computeMusicDisplayName(req: AIMusicRequest): string {
  if (req.mood && req.mood.trim()) {
    const t = firstTwoWordsTitleCase(req.mood);
    if (t) return t.slice(0, 64);
  }
  if (req.presetKey && MUSIC_PRESET_LABELS[req.presetKey]) {
    return MUSIC_PRESET_LABELS[req.presetKey];
  }
  if (req.prompt && req.prompt.trim()) {
    const t = firstTwoWordsTitleCase(req.prompt);
    if (t) return t.slice(0, 64);
  }
  return 'AI Music';
}

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
    const asset = await this.assets.storeAiAsset(
      userId, req.roomId, payload, 'image', req.prompt, this.imageModelName(),
    );
    return { previewUrl: AssetService.getProxyUrl(asset.id), assetId: asset.id };
  }

  /**
   * P2.2 — generate character token image with token-specific formula (S4.2).
   * Uses TOKEN_STYLE_MAP + TOKEN_CONSTRAINTS from GeminiProvider.buildTokenPrompt().
   */
  async generateToken(userId: string, req: AIImageRequest): Promise<AIImageResponse> {
    const payload = await this.provider.generateToken(req);
    const asset = await this.assets.storeAiAsset(
      userId, req.roomId, payload, 'image', req.prompt, this.imageModelName(),
    );
    return { previewUrl: AssetService.getProxyUrl(asset.id), assetId: asset.id };
  }

  /**
   * P2.3 — generate battlemap image with orthographic top-down constraints (S4.3).
   * Uses BATTLEMAP_STYLE_MAP + BATTLEMAP_CONSTRAINTS from GeminiProvider.buildBattlemapPrompt().
   */
  async generateBattlemap(userId: string, req: AIImageRequest): Promise<AIImageResponse> {
    const payload = await this.provider.generateBattlemap(req);
    const asset = await this.assets.storeAiAsset(
      userId, req.roomId, payload, 'image', req.prompt, this.imageModelName(),
    );
    return { previewUrl: AssetService.getProxyUrl(asset.id), assetId: asset.id };
  }

  /**
   * Ф8.3 — generate ambient music loop.
   */
  async generateMusic(userId: string, req: AIMusicRequest): Promise<AIMusicResponse> {
    const payload = await this.provider.generateMusic(req);
    // S5.5 P1 — store the full composed Lyria prompt (was empty under preset
    // flow because UI sends prompt='') and a human-readable display name
    // derived from mood/preset/prompt (was "AI:" because legacy path used
    // raw req.prompt which is empty in the structured-fields flow).
    const displayName = computeMusicDisplayName(req);
    const asset = await this.assets.storeAiAsset(
      userId, req.roomId, payload, 'audio', payload.composedPrompt, this.musicModelName(),
      { displayName },
    );
    return { previewUrl: AssetService.getProxyUrl(asset.id), assetId: asset.id };
  }

  /** Ф8.1 — text generation (LLM assistant). S6.1 role-split. */
  generateText(req: TextGenerationRequest): Promise<string> {
    return this.provider.generateText(req);
  }

  /**
   * Hard-coded model identifiers for provenance tracking. Stored on Asset rows
   * for audit trail (which model produced which artefact).
   *
   * Sync 2026-05-09 — image unification (back-on-spec): swapped to NB2 to
   * match the new GeminiProvider default. If ops applies an env-override
   * (GEMINI_IMAGE_MODEL=gemini-2.5-flash-image) for emergency-rollback, this
   * provenance string drifts from reality until the deferred getter refactor
   * lands.
   *
   * TODO: wire these from GeminiProvider.getImageModel() / getMusicModel()
   * once the provider exposes a model-name getter.
   */
  private imageModelName(): string {
    return 'gemini-3.1-flash-image-preview';
  }

  private musicModelName(): string {
    // Sync 2026-05-09 — music unification (back-on-spec): swapped to Lyria 3
    // Clip per Bible §9 line 209 + AI_PROMPT_ENGINEERING_GUIDE.md Phase 2 target.
    // Drift caveat identical to imageModelName() above when env-override is
    // applied (GEMINI_MUSIC_MODEL=lyria-002). TODO same getter refactor.
    return 'lyria-3-clip-preview';
  }
}

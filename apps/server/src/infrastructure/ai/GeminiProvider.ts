import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import type { AIImageRequest, AIMusicRequest } from '@vtt/shared';
import { AIProvider, AIQuotaError, type GeneratedBinary } from './AIProvider.js';

/**
 * Vertex AI strategy implementing the AIProvider Strategy abstraction (§2.13.4).
 * Models (per §2.3 of PROJECT_BIBLE):
 *   • text  — Gemini Flash 3 Preview
 *   • image — Gemini 3.1 Flash Image
 *   • music — Lyria 3
 *
 * Authentication: OAuth 2.0 service account; credentials are read from the
 * GCP_SERVICE_ACCOUNT_KEY env var (base64-encoded JSON), keeping AI keys
 * server-only (Незмінне рішення № 7, НФВ 4.5).
 */
export interface GeminiProviderConfig {
  projectId: string;
  location: string;
  serviceAccountKeyJson: string;
  textModel?: string;
  imageModel?: string;
  musicModel?: string;
}

const DEFAULT_TEXT_MODEL = 'gemini-flash-3-preview';
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_MUSIC_MODEL = 'lyria-3';

function isQuotaError(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  return code === 8 /* RESOURCE_EXHAUSTED */ || code === 13 /* INTERNAL */ || code === 14 /* UNAVAILABLE */;
}

export class GeminiProvider implements AIProvider {
  private readonly client: PredictionServiceClient;
  private readonly endpointBase: string;
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly musicModel: string;

  constructor(cfg: GeminiProviderConfig, client?: PredictionServiceClient) {
    const credentials = JSON.parse(
      Buffer.from(cfg.serviceAccountKeyJson, 'base64').toString('utf-8'),
    ) as { client_email: string; private_key: string };
    // Vertex AI exposes a regional endpoint (`<region>-aiplatform.googleapis.com`)
    // and a global one (`aiplatform.googleapis.com` — used when `location=global`,
    // which is the default for modern Gemini multi-region routing). The path
    // segment under `locations/<id>` keeps the literal id either way.
    const apiEndpoint =
      cfg.location === 'global'
        ? 'aiplatform.googleapis.com'
        : `${cfg.location}-aiplatform.googleapis.com`;
    this.client =
      client ??
      new PredictionServiceClient({
        projectId: cfg.projectId,
        credentials,
        apiEndpoint,
      });
    this.endpointBase = `projects/${cfg.projectId}/locations/${cfg.location}/publishers/google/models`;
    this.textModel = cfg.textModel ?? DEFAULT_TEXT_MODEL;
    this.imageModel = cfg.imageModel ?? DEFAULT_IMAGE_MODEL;
    this.musicModel = cfg.musicModel ?? DEFAULT_MUSIC_MODEL;
  }

  async generateText(prompt: string): Promise<string> {
    try {
      const [response] = await this.client.predict({
        endpoint: `${this.endpointBase}/${this.textModel}`,
        instances: [helpers.toValue({ prompt }) as never],
      });
      const predictions = response.predictions ?? [];
      const first = predictions[0];
      const decoded = first ? (helpers.fromValue(first as never) as { content?: string }) : {};
      return decoded.content ?? '';
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      throw err;
    }
  }

  async generateImage(req: AIImageRequest): Promise<GeneratedBinary> {
    try {
      const [response] = await this.client.predict({
        endpoint: `${this.endpointBase}/${this.imageModel}`,
        instances: [
          helpers.toValue({ prompt: req.prompt, style: req.style ?? 'fantasy' }) as never,
        ],
      });
      const first = (response.predictions ?? [])[0];
      const decoded = first
        ? (helpers.fromValue(first as never) as { bytesBase64Encoded?: string; mimeType?: string })
        : {};
      if (!decoded.bytesBase64Encoded) throw new Error('Vertex AI returned empty image payload');
      return {
        bytes: Buffer.from(decoded.bytesBase64Encoded, 'base64'),
        mimeType: decoded.mimeType ?? 'image/png',
      };
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      throw err;
    }
  }

  async generateMusic(req: AIMusicRequest): Promise<GeneratedBinary> {
    try {
      const [response] = await this.client.predict({
        endpoint: `${this.endpointBase}/${this.musicModel}`,
        instances: [
          helpers.toValue({
            prompt: req.prompt,
            durationSec: req.durationSec ?? 30,
          }) as never,
        ],
      });
      const first = (response.predictions ?? [])[0];
      const decoded = first
        ? (helpers.fromValue(first as never) as { bytesBase64Encoded?: string; mimeType?: string })
        : {};
      if (!decoded.bytesBase64Encoded) throw new Error('Vertex AI returned empty audio payload');
      return {
        bytes: Buffer.from(decoded.bytesBase64Encoded, 'base64'),
        mimeType: decoded.mimeType ?? 'audio/mpeg',
      };
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      throw err;
    }
  }
}

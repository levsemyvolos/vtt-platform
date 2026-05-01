import { GoogleGenAI } from '@google/genai';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import type { AIImageRequest, AIMusicRequest } from '@vtt/shared';
import { AIProvider, AIQuotaError, type GeneratedBinary } from './AIProvider.js';

/**
 * Vertex AI strategy implementing the AIProvider Strategy abstraction (§2.13.4).
 *
 * Hybrid SDK setup, because Vertex AI exposes three different APIs for the
 * three modalities we need:
 *   • text  — `@google/genai` `models.generateContent()` (Gemini 2.5 Flash).
 *   • image — same SDK + `responseModalities: ['TEXT', 'IMAGE']` (Gemini 2.5
 *             Flash Image GA, Phase 2 target: gemini-3.1-flash-image-preview).
 *   • music — `@google-cloud/aiplatform` legacy `predict()` for Lyria 2
 *             (`lyria-002`). Phase 2 target Lyria 3 lives on a different REST
 *             endpoint (`/v1beta1/.../interactions`) and would be added as a
 *             separate `fetch`-based code path here.
 *
 * Authentication: OAuth 2.0 service account JSON (base64-encoded in
 * `GCP_SERVICE_ACCOUNT_KEY` env var). Decoded once and shared between both
 * underlying clients (Незмінне рішення № 7, НФВ 4.5).
 *
 * Earlier versions of this provider used `PredictionServiceClient.predict()`
 * for text + image too. Vertex now rejects that path with
 * `9 FAILED_PRECONDITION: Gemini cannot be accessed through Vertex
 * Predict/RawPredict API` — hence the split SDK setup.
 */
export interface GeminiProviderConfig {
  projectId: string;
  /** Region for Gemini multimodal (text + image). 'global' is recommended. */
  location: string;
  serviceAccountKeyJson: string;
  textModel?: string;
  imageModel?: string;
  musicModel?: string;
  /** Region for Lyria 2 predict(). Defaults to 'us-central1' since Lyria 2
   *  is not available on `global`. */
  musicLocation?: string;
}

const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_MUSIC_MODEL = 'lyria-002';
const DEFAULT_MUSIC_LOCATION = 'us-central1';

function isQuotaError(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  return code === 8 /* RESOURCE_EXHAUSTED */ || code === 13 /* INTERNAL */ || code === 14 /* UNAVAILABLE */;
}

interface InlinePart {
  inlineData?: { data?: string; mimeType?: string };
}

export class GeminiProvider implements AIProvider {
  private readonly genai: GoogleGenAI;
  private readonly predictClient: PredictionServiceClient;
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly musicModel: string;
  private readonly musicEndpointBase: string;

  constructor(
    cfg: GeminiProviderConfig,
    opts?: { genai?: GoogleGenAI; predict?: PredictionServiceClient },
  ) {
    const credentials = JSON.parse(
      Buffer.from(cfg.serviceAccountKeyJson, 'base64').toString('utf-8'),
    ) as { client_email: string; private_key: string };

    this.genai =
      opts?.genai ??
      new GoogleGenAI({
        vertexai: true,
        project: cfg.projectId,
        location: cfg.location,
        googleAuthOptions: { credentials },
      });

    const musicLocation = cfg.musicLocation ?? DEFAULT_MUSIC_LOCATION;
    this.predictClient =
      opts?.predict ??
      new PredictionServiceClient({
        projectId: cfg.projectId,
        credentials,
        apiEndpoint: `${musicLocation}-aiplatform.googleapis.com`,
      });
    this.musicEndpointBase = `projects/${cfg.projectId}/locations/${musicLocation}/publishers/google/models`;

    this.textModel = cfg.textModel ?? DEFAULT_TEXT_MODEL;
    this.imageModel = cfg.imageModel ?? DEFAULT_IMAGE_MODEL;
    this.musicModel = cfg.musicModel ?? DEFAULT_MUSIC_MODEL;
  }

  async generateText(prompt: string): Promise<string> {
    try {
      const response = await this.genai.models.generateContent({
        model: this.textModel,
        contents: prompt,
      });
      return response.text ?? '';
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      throw err;
    }
  }

  async generateImage(req: AIImageRequest): Promise<GeneratedBinary> {
    const fullPrompt = req.style ? `${req.style} style: ${req.prompt}` : req.prompt;
    try {
      const response = await this.genai.models.generateContent({
        model: this.imageModel,
        contents: fullPrompt,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlinePart[];
      const part = parts.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) {
        throw new Error('Vertex AI returned empty image payload');
      }
      return {
        bytes: Buffer.from(part.inlineData.data, 'base64'),
        mimeType: part.inlineData.mimeType ?? 'image/png',
      };
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      throw err;
    }
  }

  async generateMusic(req: AIMusicRequest): Promise<GeneratedBinary> {
    try {
      const [response] = await this.predictClient.predict({
        endpoint: `${this.musicEndpointBase}/${this.musicModel}`,
        instances: [helpers.toValue({ prompt: req.prompt }) as never],
        // Lyria 2 docs example sets sampleCount; without it some regions
        // return predictions=[] silently.
        parameters: helpers.toValue({ sampleCount: 1 }) as never,
      });
      const first = (response.predictions ?? [])[0];
      const decoded = first
        ? (helpers.fromValue(first as never) as { audioContent?: string; mimeType?: string })
        : {};
      if (!decoded.audioContent) {
        // Diagnostic — surface the exact response shape so we can adjust the
        // decoder if Vertex changes it. Removed once Lyria 2 settles.
        // eslint-disable-next-line no-console
        console.error(
          '[lyria] empty audio.',
          'predictions.length=',
          response.predictions?.length ?? 0,
          'first keys=',
          first ? Object.keys(first as object) : null,
          'first=',
          JSON.stringify(first ?? null),
          'decoded=',
          JSON.stringify(decoded),
        );
        throw new Error('Vertex AI returned empty audio payload');
      }
      return {
        bytes: Buffer.from(decoded.audioContent, 'base64'),
        mimeType: decoded.mimeType ?? 'audio/wav',
      };
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      throw err;
    }
  }
}

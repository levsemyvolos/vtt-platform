import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import type { AIImageRequest, AIMusicRequest } from '@vtt/shared';
import { AIProvider, AIQuotaError, AISafetyError, AIInvalidPromptError, AINetworkError, type GeneratedBinary, type ImageMultiTurnRequest } from './AIProvider.js';

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
  /** Model used for multi-turn image generation (Session 7.1, Nano Banana 2).
   *  Defaults to 'gemini-3.1-flash-image-preview'. */
  multiTurnImageModel?: string;
  /** Region for multi-turn image generation. Defaults to 'global' (required
   *  for gemini-3.1-flash-image-preview). */
  multiTurnImageLocation?: string;
  /** Region for text generation. Defaults to 'global'. */
  textLocation?: string;
  musicModel?: string;
  /** Region for Lyria 2 predict(). Defaults to 'us-central1' since Lyria 2
   *  is not available on `global`. */
  musicLocation?: string;
}

const DEFAULT_TEXT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_TEXT_LOCATION = 'global';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_MULTI_TURN_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_MUSIC_MODEL = 'lyria-002';
const DEFAULT_MUSIC_LOCATION = 'us-central1';

function isQuotaError(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  return code === 8 /* RESOURCE_EXHAUSTED */ || code === 13 /* INTERNAL */ || code === 14 /* UNAVAILABLE */;
}

function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: number | string }).code;
  // gRPC code 14 = UNAVAILABLE, code 4 = DEADLINE_EXCEEDED.
  // Node libuv codes for transport failures:
  if (code === 14 || code === 4) return true;
  if (typeof code === 'string' && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code)) {
    return true;
  }
  return false;
}

function isInvalidArgumentError(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  // gRPC code 3 = INVALID_ARGUMENT, code 9 = FAILED_PRECONDITION.
  return code === 3 || code === 9;
}

interface FinishReasonCarrier {
  finishReason?: string;
}

/** Returns true if the error is already one of our domain error types. */
function isAIDomainError(err: unknown): err is AIQuotaError | AISafetyError | AIInvalidPromptError | AINetworkError {
  return (
    err instanceof AIQuotaError ||
    err instanceof AISafetyError ||
    err instanceof AIInvalidPromptError ||
    err instanceof AINetworkError
  );
}

/** Re-throws `err` as the appropriate AI domain error, or re-throws as-is. */
function wrapRawError(err: unknown): never {
  if (isQuotaError(err)) throw new AIQuotaError();
  if (isNetworkError(err)) throw new AINetworkError();
  if (isInvalidArgumentError(err)) throw new AIInvalidPromptError();
  throw err as Error;
}
interface PromptFeedbackCarrier {
  promptFeedback?: { blockReason?: string };
}

function detectSafetyBlock(response: unknown): boolean {
  if (response == null || typeof response !== 'object') return false;
  const r = response as { candidates?: FinishReasonCarrier[] } & PromptFeedbackCarrier;
  if (r.promptFeedback?.blockReason) return true;
  const candidates = r.candidates ?? [];
  for (const c of candidates) {
    // Vertex marks blocked candidates with finishReason 'SAFETY' (or 'PROHIBITED_CONTENT', 'BLOCKLIST').
    if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT' || c.finishReason === 'BLOCKLIST') {
      return true;
    }
  }
  return false;
}

interface InlinePart {
  inlineData?: { data?: string; mimeType?: string };
}

/**
 * Manually unwrap a `google.protobuf.Value` from PredictionServiceClient
 * responses. The aiplatform `helpers.fromValue` does NOT actually inflate the
 * proto wrapper for our predict() responses — diagnostic logging on Render
 * showed payloads arriving as `{structValue: {fields: {bytesBase64Encoded:
 * {stringValue: "..."}}}}` and `helpers.fromValue` returning `{}`. Walking the
 * Value oneof ourselves is safer and avoids the SDK quirk.
 */
function unwrapProtoValue(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return v;
  const val = v as Record<string, unknown>;
  if ('stringValue' in val) return val.stringValue;
  if ('numberValue' in val) return val.numberValue;
  if ('boolValue' in val) return val.boolValue;
  const struct = val.structValue as { fields?: Record<string, unknown> } | undefined;
  if (struct?.fields) {
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(struct.fields)) {
      out[k] = unwrapProtoValue(f);
    }
    return out;
  }
  const list = val.listValue as { values?: unknown[] } | undefined;
  if (list?.values) return list.values.map(unwrapProtoValue);
  return undefined;
}

export class GeminiProvider implements AIProvider {
  private readonly genai: GoogleGenAI;
  private readonly textGenai: GoogleGenAI;
  private readonly multiTurnImageGenai: GoogleGenAI;
  private readonly predictClient: PredictionServiceClient;
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly multiTurnImageModel: string;
  private readonly musicModel: string;
  private readonly musicEndpointBase: string;

  private static buildGenAI(
    projectId: string,
    location: string,
    credentials: { client_email: string; private_key: string },
    override?: GoogleGenAI,
  ): GoogleGenAI {
    return override ?? new GoogleGenAI({ vertexai: true, project: projectId, location, googleAuthOptions: { credentials } });
  }

  constructor(
    cfg: GeminiProviderConfig,
    opts?: { genai?: GoogleGenAI; predict?: PredictionServiceClient },
  ) {
    const credentials = JSON.parse(
      Buffer.from(cfg.serviceAccountKeyJson, 'base64').toString('utf-8'),
    ) as { client_email: string; private_key: string };

    this.genai = GeminiProvider.buildGenAI(cfg.projectId, cfg.location, credentials, opts?.genai);
    this.textGenai = GeminiProvider.buildGenAI(cfg.projectId, cfg.textLocation ?? DEFAULT_TEXT_LOCATION, credentials, opts?.genai);
    this.multiTurnImageGenai = GeminiProvider.buildGenAI(cfg.projectId, cfg.multiTurnImageLocation ?? 'global', credentials, opts?.genai);

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
    this.multiTurnImageModel = cfg.multiTurnImageModel ?? DEFAULT_MULTI_TURN_IMAGE_MODEL;
    this.musicModel = cfg.musicModel ?? DEFAULT_MUSIC_MODEL;
  }

  private isThinkingHigh(opts?: { thinkingLevel?: 'low' | 'high' }): boolean {
    return (opts?.thinkingLevel ?? 'low') === 'high';
  }

  async generateText(prompt: string, opts?: { thinkingLevel?: 'low' | 'high' }): Promise<string> {
    let response;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = { model: this.textModel, contents: prompt };
      if (this.isThinkingHigh(opts)) {
        params.config = { thinkingConfig: { thinkingBudget: -1 } };
      }
      response = await this.textGenai.models.generateContent(params);
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      if (isNetworkError(err)) throw new AINetworkError();
      if (isInvalidArgumentError(err)) throw new AIInvalidPromptError();
      throw err;
    }
    if (detectSafetyBlock(response)) {
      throw new AISafetyError();
    }
    return response.text ?? '';
  }

  async *generateTextStream(prompt: string, signal?: AbortSignal, opts?: { thinkingLevel?: 'low' | 'high' }): AsyncIterable<string> {
    let stream: AsyncGenerator<import('@google/genai').GenerateContentResponse>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = { model: this.textModel, contents: prompt };
      if (this.isThinkingHigh(opts)) {
        params.config = { thinkingConfig: { thinkingBudget: -1 } };
      }
      stream = await this.textGenai.models.generateContentStream(params);
    } catch (err) {
      wrapRawError(err);
    }
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) return;
        if (detectSafetyBlock(chunk)) throw new AISafetyError();
        const text = chunk.text;
        if (text) yield text;
      }
    } catch (err) {
      if (isAIDomainError(err)) throw err;
      wrapRawError(err);
    }
  }

  async generateImage(req: AIImageRequest): Promise<GeneratedBinary> {
    const fullPrompt = req.style ? `${req.style} style: ${req.prompt}` : req.prompt;
    let response;
    try {
      response = await this.genai.models.generateContent({
        model: this.imageModel,
        contents: fullPrompt,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      if (isNetworkError(err)) throw new AINetworkError();
      if (isInvalidArgumentError(err)) throw new AIInvalidPromptError();
      throw err;
    }
    if (detectSafetyBlock(response)) {
      throw new AISafetyError();
    }
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlinePart[];
    const part = parts.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      // Empty payload without an explicit safety block — treat as invalid prompt.
      throw new AIInvalidPromptError('Vertex AI returned empty image payload');
    }
    return {
      bytes: Buffer.from(part.inlineData.data, 'base64'),
      mimeType: part.inlineData.mimeType ?? 'image/png',
    };
  }

  async generateImageMultiTurn(
    req: ImageMultiTurnRequest,
    signal?: AbortSignal,
  ): Promise<GeneratedBinary> {
    // The Vertex AI generateContent shape accepts an array of `Content` objects,
    // each with role and parts. We map our history + new prompt into that shape.
    const contents = this.buildMultiTurnContents(req);
    let response;
    try {
      response = await this.multiTurnImageGenai.models.generateContent({
        model: this.multiTurnImageModel,
        contents,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      if (isNetworkError(err)) throw new AINetworkError();
      if (isInvalidArgumentError(err)) throw new AIInvalidPromptError();
      throw err;
    }
    if (signal?.aborted) throw new AIQuotaError('aborted');
    if (detectSafetyBlock(response)) throw new AISafetyError();
    const responseParts = (response.candidates?.[0]?.content?.parts ?? []) as InlinePart[];
    const part = responseParts.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      throw new AIInvalidPromptError('Vertex AI returned empty image payload');
    }
    return {
      bytes: Buffer.from(part.inlineData.data, 'base64'),
      mimeType: part.inlineData.mimeType ?? 'image/png',
    };
  }

  private buildMultiTurnContents(req: ImageMultiTurnRequest): Content[] {
    // Each history entry becomes a Content object with appropriate role + parts.
    // Reference images for the CURRENT turn are added as parts to the same
    // user-message that contains nextPrompt.
    const result: Content[] = [];
    for (const entry of req.history) {
      const role = entry.role === 'user' ? 'user' : 'model';
      const parts: Part[] = [];
      if (entry.imageBytes && entry.mimeType) {
        parts.push({
          inlineData: { data: entry.imageBytes.toString('base64'), mimeType: entry.mimeType },
        });
      }
      if (entry.text) {
        parts.push({ text: entry.text });
      }
      if (parts.length > 0) result.push({ role, parts });
    }
    // Current turn — references then text.
    const currentParts: Part[] = [];
    for (const ref of req.references ?? []) {
      currentParts.push({
        inlineData: { data: ref.bytes.toString('base64'), mimeType: ref.mimeType },
      });
    }
    currentParts.push({ text: req.nextPrompt });
    result.push({ role: 'user', parts: currentParts });
    return result;
  }

  async generateMusic(req: AIMusicRequest): Promise<GeneratedBinary> {
    let predictionResponse: { predictions?: unknown[] } = {};
    try {
      const [res] = await this.predictClient.predict({
        endpoint: `${this.musicEndpointBase}/${this.musicModel}`,
        instances: [helpers.toValue({ prompt: req.prompt }) as never],
        parameters: helpers.toValue({ sampleCount: 1 }) as never,
      });
      predictionResponse = res as { predictions?: unknown[] };
    } catch (err) {
      if (isQuotaError(err)) throw new AIQuotaError();
      if (isNetworkError(err)) throw new AINetworkError();
      if (isInvalidArgumentError(err)) throw new AIInvalidPromptError();
      throw err;
    }
    const first = (predictionResponse.predictions ?? [])[0];
    // Lyria 2 returns audio under `bytesBase64Encoded` (same field name as
    // Imagen). Decoded shape verified on prod via diagnostic logging.
    const decoded = (unwrapProtoValue(first) ?? {}) as {
      bytesBase64Encoded?: string;
      mimeType?: string;
    };
    if (!decoded.bytesBase64Encoded) {
      throw new AIInvalidPromptError('Vertex AI returned empty audio payload');
    }
    return {
      bytes: Buffer.from(decoded.bytesBase64Encoded, 'base64'),
      mimeType: decoded.mimeType ?? 'audio/wav',
    };
  }
}

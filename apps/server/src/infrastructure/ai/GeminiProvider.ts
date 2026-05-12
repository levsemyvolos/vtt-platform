import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import { GoogleAuth } from 'google-auth-library';
import type { AIImageRequest, AIMusicRequest, MusicPresetKey } from '@vtt/shared';
import { AIProvider, AIQuotaError, AISafetyError, AIInvalidPromptError, AINetworkError, type GeneratedBinary, type ImageMultiTurnRequest, type TextGenerationRequest } from './AIProvider.js';
import { circleClipPng } from '../../lib/circleClip.js';

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
  /** Model used for multi-turn image generation (Nano Banana 2).
   *  Defaults to 'gemini-3.1-flash-image-preview'. */
  multiTurnImageModel?: string;
  /** Region for multi-turn image generation. Defaults to 'global' (required
   *  for gemini-3.1-flash-image-preview). */
  multiTurnImageLocation?: string;
  /** Region for single-turn image generation (generateImage / generateToken /
   *  generateBattlemap). Defaults to 'global' — us-central1 uses stricter
   *  default safety thresholds and causes spurious SAFETY blocks. */
  imageLocation?: string;
  /** Region for text generation. Defaults to 'global'. */
  textLocation?: string;
  musicModel?: string;
  /** Region for Lyria 2 predict(). Defaults to 'us-central1' since Lyria 2
   *  is not available on `global`. */
  musicLocation?: string;
}

const DEFAULT_TEXT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_TEXT_LOCATION = 'global';
// Both single-turn and multi-turn paths default to Nano Banana 2
// (gemini-3.1-flash-image-preview). Env-overrides (GEMINI_IMAGE_MODEL,
// GEMINI_NB2_MODEL) allow emergency-rollback to gemini-2.5-flash-image.
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_MULTI_TURN_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
// Default music model = Lyria 3 Clip (`lyria-3-clip-preview`).
// Empirically verified 2.5× faster (10 s vs 25 s) and 10×
// smaller payload (580 KB MP3 vs 6.3 MB WAV) than Lyria 2; no allowlist needed.
// Lyria 3 only listens on `/v1beta1/.../interactions` endpoint at `global` —
// `:predict` returns 404, `:generateContent` returns 400. Hence raw fetch in
// `generateMusicLyria3()`. Emergency rollback: GEMINI_MUSIC_MODEL=lyria-002
// triggers the legacy `generateMusicLegacy()` predict() path at us-central1.
const DEFAULT_MUSIC_MODEL = 'lyria-3-clip-preview';
const DEFAULT_MUSIC_LOCATION = 'global';
const LEGACY_MUSIC_LOCATION = 'us-central1'; // Lyria 2 only — predict() endpoint is region-bound

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
  private readonly imageGenai: GoogleGenAI;
  private readonly textGenai: GoogleGenAI;
  private readonly multiTurnImageGenai: GoogleGenAI;
  private readonly predictClient: PredictionServiceClient;

  // BLOCK_ONLY_HIGH on all harm categories — lets through tabletop RPG fantasy
  // content (dark fantasy, combat, etc.) while still blocking clearly harmful
  // material. Default Vertex thresholds are too conservative for TTRPG use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static readonly IMAGE_SAFETY_SETTINGS: any[] = [
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY',    threshold: 'BLOCK_ONLY_HIGH' },
  ];
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly multiTurnImageModel: string;
  private readonly musicModel: string;
  // Legacy Lyria 2 path (predict()):
  private readonly musicEndpointBase: string;
  // Lyria 3 path (raw fetch /interactions): OAuth via GoogleAuth + URL components.
  private readonly musicAuth: GoogleAuth;
  private readonly musicProjectId: string;
  private readonly musicLocation: string;

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
    this.imageGenai = GeminiProvider.buildGenAI(cfg.projectId, cfg.imageLocation ?? 'global', credentials, opts?.genai);
    this.textGenai = GeminiProvider.buildGenAI(cfg.projectId, cfg.textLocation ?? DEFAULT_TEXT_LOCATION, credentials, opts?.genai);
    this.multiTurnImageGenai = GeminiProvider.buildGenAI(cfg.projectId, cfg.multiTurnImageLocation ?? 'global', credentials, opts?.genai);

    // Legacy Lyria 2 predictClient — hardcoded to us-central1 since lyria-002
    // only exists there. Used only when GEMINI_MUSIC_MODEL=lyria-002 for emergency
    // rollback; otherwise predictClient sits idle.
    this.predictClient =
      opts?.predict ??
      new PredictionServiceClient({
        projectId: cfg.projectId,
        credentials,
        apiEndpoint: `${LEGACY_MUSIC_LOCATION}-aiplatform.googleapis.com`,
      });
    this.musicEndpointBase = `projects/${cfg.projectId}/locations/${LEGACY_MUSIC_LOCATION}/publishers/google/models`;

    // Lyria 3 path setup: dedicated GoogleAuth client for fetch-based
    // /v1beta1/.../interactions endpoint at the configured music location.
    this.musicProjectId = cfg.projectId;
    this.musicLocation = cfg.musicLocation ?? DEFAULT_MUSIC_LOCATION;
    this.musicAuth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    this.textModel = cfg.textModel ?? DEFAULT_TEXT_MODEL;
    this.imageModel = cfg.imageModel ?? DEFAULT_IMAGE_MODEL;
    this.multiTurnImageModel = cfg.multiTurnImageModel ?? DEFAULT_MULTI_TURN_IMAGE_MODEL;
    this.musicModel = cfg.musicModel ?? DEFAULT_MUSIC_MODEL;
  }

  private isThinkingHigh(opts?: { thinkingLevel?: 'low' | 'high' }): boolean {
    return (opts?.thinkingLevel ?? 'low') === 'high';
  }

  /**
   * S6.1 role-split: builds Vertex SDK params from a TextGenerationRequest.
   *   - system instruction → params.config.systemInstruction
   *   - history (with role mapping 'assistant' → 'model') + current user →
   *     params.contents array
   *   - thinking-high → params.config.thinkingConfig
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildTextParams(req: TextGenerationRequest, opts?: { thinkingLevel?: 'low' | 'high' }): any {
    const contents = [
      ...req.history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: req.user }] },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {};
    if (req.system && req.system.length > 0) {
      config.systemInstruction = { parts: [{ text: req.system }] };
    }
    if (this.isThinkingHigh(opts)) {
      config.thinkingConfig = { thinkingBudget: -1 };
    }
    // S6.2 / P5.2 — JSON-mode passthrough. Caller (AssistantService for the
    // NPC context) sets responseMimeType + a Vertex Schema; the SDK then
    // emits structured JSON instead of free-form text. Streaming caller
    // never sets these fields.
    if (req.responseMimeType) {
      config.responseMimeType = req.responseMimeType;
    }
    if (req.responseSchema) {
      config.responseSchema = req.responseSchema;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { model: this.textModel, contents };
    if (Object.keys(config).length > 0) params.config = config;
    return params;
  }

  async generateText(req: TextGenerationRequest, opts?: { thinkingLevel?: 'low' | 'high' }): Promise<string> {
    let response;
    try {
      response = await this.textGenai.models.generateContent(this.buildTextParams(req, opts));
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

  async *generateTextStream(req: TextGenerationRequest, signal?: AbortSignal, opts?: { thinkingLevel?: 'low' | 'high' }): AsyncIterable<string> {
    let stream: AsyncGenerator<import('@google/genai').GenerateContentResponse>;
    try {
      stream = await this.textGenai.models.generateContentStream(this.buildTextParams(req, opts));
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

  // P2.1 — Scene Background formula (S4.1)
  private static readonly SCENE_STYLE_MAP: Record<string, string> = {
    'fantasy':      'Fantasy digital illustration, painterly',
    'realistic':    'Photorealistic, highly detailed',
    'sci-fi':       'Science fiction concept art, cinematic',
    'cartoon':      'Cartoon illustration, stylized',
    'dark-fantasy': 'Tabletop RPG dark fantasy illustration, atmospheric',
    'watercolor':   'Watercolor painting, artistic',
  };

  private static readonly SCENE_CONSTRAINTS =
    'tabletop RPG scene illustration, no text, no logos, no UI overlays, no watermarks, landscape orientation';

  static buildSceneBackgroundPrompt(req: AIImageRequest): string {
    const styleDesc =
      (req.style && GeminiProvider.SCENE_STYLE_MAP[req.style])
        ? GeminiProvider.SCENE_STYLE_MAP[req.style]
        : (req.style ?? 'Fantasy digital illustration');

    const parts: string[] = [req.prompt];
    if (req.composition)     parts.push(req.composition);
    if (req.locationDetails) parts.push(req.locationDetails);
    if (req.lighting)        parts.push(req.lighting);
    if (req.palette)         parts.push(req.palette);

    return `${styleDesc}: ${parts.join(', ')}. ${GeminiProvider.SCENE_CONSTRAINTS}`;
  }

  // P2.2 — Token formula (S4.2)
  private static readonly TOKEN_STYLE_MAP: Record<string, string> = {
    'fantasy':      'Fantasy character illustration, detailed',
    'realistic':    'Photorealistic portrait, highly detailed',
    'sci-fi':       'Science fiction character art, cinematic',
    'cartoon':      'Cartoon character art, stylized',
    'dark-fantasy': 'Dark fantasy character art, dramatic',
    'watercolor':   'Watercolor character illustration, artistic',
  };

  private static readonly TOKEN_CONSTRAINTS =
    'tabletop RPG character token art, neutral pose, clean solid white background, centered composition, circular crop friendly, no text, no logos, no watermarks';

  static buildTokenPrompt(req: AIImageRequest): string {
    const styleDesc =
      (req.style && GeminiProvider.TOKEN_STYLE_MAP[req.style])
        ? GeminiProvider.TOKEN_STYLE_MAP[req.style]
        : (req.style ?? 'Fantasy character illustration, detailed');
    const framing =
      req.tokenFraming === 'bust'      ? 'bust portrait, head and shoulders only' :
      req.tokenFraming === 'half-body' ? 'half-body portrait, waist up'           :
      'full-body view';
    return `${styleDesc}: ${req.prompt}, ${framing}. ${GeminiProvider.TOKEN_CONSTRAINTS}`;
  }

  // P3 — Music formula (S5.1). Data mirrors Guide §3.1–3.5.
  private static readonly MUSIC_PRESETS: Record<MusicPresetKey, {
    sceneType: string; genre: string; mood: string; instrumentation: string;
    tempo: string; dynamics: string; ambiance: string; structure: string;
  }> = {
    cave: {
      sceneType:       'Instrumental beatless ambient soundscape for a dark underground cave system in a tabletop RPG session',
      genre:           'dark ambient soundscape',
      mood:            'eerie, tense, claustrophobic, and quietly threatening',
      instrumentation: 'low resonant sub-bass drones, occasional atonal bowed metal scrapes, sparse dissonant cello harmonics, processed cave reverb on all elements',
      tempo:           'extremely slow, almost no perceptible pulse, no percussion kit, no drums',
      dynamics:        'low and steady, never surges to foreground',
      ambiance:        'distant echoing water drips with heavy reverb, faint air currents, occasional distant stone creak',
      structure:       'seamless loop-friendly texture, no obvious intro or climax, slow subtle evolution over 3–5 minutes',
    },
    tavern: {
      sceneType:       'Instrumental loop-friendly ambient soundscape for a cozy medieval fantasy tavern in a tabletop RPG session',
      genre:           'environmental acoustic soundscape with light folk underscore',
      mood:            'warm, convivial, slightly chaotic but comfortable and safe',
      instrumentation: 'solo fingerpicked nylon-string lute as primary, quiet wooden flute as secondary, very soft subdued hand drum or finger tambourine (extremely gentle, barely audible)',
      tempo:           'slow, gentle swaying pace, no driving groove, irregular subtle pulse that feels organic and live',
      dynamics:        'moderate but even, no big volume changes, stays clearly in background',
      ambiance:        'low murmur of overlapping conversations, occasional distant laughter, clinking cups or tankards, crackling fireplace in background',
      structure:       'themes and textures come and go slowly without drawing attention, seamless loop',
    },
    exploration: {
      sceneType:       'Instrumental loop-friendly ambient underscore for outdoor wilderness travel in a fantasy tabletop RPG session',
      genre:           'cinematic nature ambient with subtle orchestral elements',
      mood:            'contemplative, slightly melancholic, with undertones of quiet wonder and mild unease',
      instrumentation: 'slow bowed strings in sustained long tones, solo acoustic guitar or lute plucking a sparse motif, wind pad in the high register, very occasional soft orchestral horn swells',
      tempo:           'slow, free-flowing tempo with no fixed beat, rubato phrasing',
      dynamics:        'low to medium, rises and falls gently like breathing, never intrusive',
      ambiance:        'light wind through trees, occasional bird call, distant water',
      structure:       'seamless loop, gradual texture changes every 60–90 seconds, no clear beginning or end',
    },
    tension: {
      sceneType:       'Instrumental loop-friendly tense ambient underscore for a suspenseful moment before combat in a tabletop RPG session',
      genre:           'cinematic tension underscore, dark orchestral',
      mood:            'suspenseful, focused, cautiously nervous, slow-building dread',
      instrumentation: 'muted low strings in staccato repeated patterns, subtle brass swells that don\'t resolve, soft metallic textures (bowed cymbal, bowed guitar), occasional very quiet timpani pulse (slow, irregular)',
      tempo:           'slow to moderate with an irregular, unpredictable pulse — tension without driving momentum',
      dynamics:        'low to medium, ebb and flow without reaching a climax',
      ambiance:        'barely audible distant armor clinks, muffled footsteps, wind',
      structure:       'continuous loop with gradual tension increase and release cycles, no climax, no resolution — sustained unresolved tension',
    },
    combat: {
      sceneType:       'Instrumental orchestral battle music for a climactic combat encounter in a fantasy tabletop RPG',
      genre:           'dark fantasy cinematic orchestral action',
      mood:            'urgent, epic, dramatic, and slightly desperate — not triumphant',
      instrumentation: 'heavy staccato string ostinato, deep brass swells, taiko-style orchestral drums and bass drum, optional anvil or metallic percussion',
      tempo:           'fast driving pace, 120–140 BPM, strong rhythmic momentum using orchestral percussion only',
      dynamics:        'medium to loud, can hit foreground during combat',
      ambiance:        '',
      structure:       'loopable section with a repeating A section and occasional B variation, no clear end',
    },
  };

  // Always appended to every music prompt (Guide §3 Universal Formula).
  static readonly MUSIC_HARD_CONSTRAINTS =
    'instrumental only, no vocals, no lyrics, no chanting, no choirs with text, no strong drum beats, no dance or EDM energy, must not overpower spoken conversation';

  /** Field-defaults for the structured music-prompt path. */
  private static readonly MUSIC_FALLBACK_FIELDS = {
    sceneType:       'Atmospheric instrumental ambient soundscape for a tabletop RPG session',
    genre:           'dark ambient underscore',
    structure:       'seamless loop-friendly, gradual texture evolution, no obvious intro or outro',
    mood:            'atmospheric and immersive',
    instrumentation: 'sustained strings and ambient textures',
    tempo:           'very slow, almost no perceptible pulse, no drums',
    dynamics:        'low and steady',
    ambiance:        '',
  } as const;

  /** Lower-precedence: preset value or fallback (used for fields the user can't override). */
  private static pickPresetField(presetValue: string | undefined, fallback: string): string {
    return presetValue ?? fallback;
  }

  /** Higher-precedence: per-request override > preset > fallback. */
  private static pickOverrideField(
    reqValue: string | undefined,
    presetValue: string | undefined,
    fallback: string,
  ): string {
    return reqValue || presetValue || fallback;
  }

  /**
   * Merges (preset?, per-request overrides, fallbacks) into a single resolved
   * field set. Resolution order per field: per-request value > preset value > fallback.
   */
  private static resolveMusicFields(req: AIMusicRequest): Record<keyof typeof GeminiProvider.MUSIC_FALLBACK_FIELDS, string> {
    const p = req.presetKey ? GeminiProvider.MUSIC_PRESETS[req.presetKey] : null;
    const f = GeminiProvider.MUSIC_FALLBACK_FIELDS;
    const preset = GeminiProvider.pickPresetField;
    const overr  = GeminiProvider.pickOverrideField;
    return {
      sceneType:       preset(p?.sceneType, f.sceneType),
      genre:           preset(p?.genre,     f.genre),
      structure:       preset(p?.structure, f.structure),
      mood:            overr(req.mood,            p?.mood,            f.mood),
      instrumentation: overr(req.instrumentation, p?.instrumentation, f.instrumentation),
      tempo:           overr(req.tempo,           p?.tempo,           f.tempo),
      dynamics:        overr(req.dynamics,        p?.dynamics,        f.dynamics),
      ambiance:        overr(req.ambiance,        p?.ambiance,        f.ambiance),
    };
  }

  static buildMusicPrompt(req: AIMusicRequest): string {
    // Legacy path: no structured fields → raw prompt + hard constraints appended.
    const hasStructuredFields = req.presetKey || req.mood || req.instrumentation || req.tempo;
    if (!hasStructuredFields) {
      const hard = `Hard constraints: ${GeminiProvider.MUSIC_HARD_CONSTRAINTS}.`;
      if (req.prompt && !req.prompt.includes('no vocals')) return `${req.prompt}\n${hard}`;
      return req.prompt;
    }

    const f = GeminiProvider.resolveMusicFields(req);
    const lines = [
      `${f.sceneType}.`,
      `Genre/Style: ${f.genre}.`,
      `Mood: ${f.mood}.`,
      `Instrumentation: ${f.instrumentation}.`,
      `Tempo/Rhythm: ${f.tempo}.`,
      `Dynamics: ${f.dynamics}.`,
    ];
    if (f.ambiance) lines.push(`Ambiance/Sound design: ${f.ambiance}.`);
    lines.push(`Structure: ${f.structure}.`);
    lines.push(`Hard constraints: ${GeminiProvider.MUSIC_HARD_CONSTRAINTS}.`);
    return lines.join('\n');
  }

  async generateImage(req: AIImageRequest): Promise<GeneratedBinary> {
    const fullPrompt = GeminiProvider.buildSceneBackgroundPrompt(req);
    let response;
    try {
      response = await this.imageGenai.models.generateContent({
        model: this.imageModel,
        contents: fullPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: { responseModalities: ['TEXT', 'IMAGE'], safetySettings: GeminiProvider.IMAGE_SAFETY_SETTINGS } as any,
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

  async generateToken(req: AIImageRequest): Promise<GeneratedBinary> {
    const fullPrompt = GeminiProvider.buildTokenPrompt(req);
    let response;
    try {
      response = await this.imageGenai.models.generateContent({
        model: this.imageModel,
        contents: fullPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: { responseModalities: ['TEXT', 'IMAGE'], safetySettings: GeminiProvider.IMAGE_SAFETY_SETTINGS } as any,
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
      throw new AIInvalidPromptError('Vertex AI returned empty token image payload');
    }
    const rawBytes = Buffer.from(part.inlineData.data, 'base64');
    const clipped = await circleClipPng(rawBytes);
    return { bytes: clipped, mimeType: 'image/png' };
  }

  // P2.3 — Battlemap formula (S4.3)
  private static readonly BATTLEMAP_STYLE_MAP: Record<string, string> = {
    'fantasy':      'Fantasy illustrated battlemap, painterly',
    'realistic':    'Realistic battlemap, highly detailed',
    'sci-fi':       'Science fiction battlemap, concept art style',
    'cartoon':      'Cartoon illustrated battlemap, stylized',
    'dark-fantasy': 'Dark fantasy battlemap, dramatic',
    'watercolor':   'Watercolor illustrated battlemap, artistic',
  };

  private static readonly BATTLEMAP_CONSTRAINTS =
    'true top-down orthographic view, no perspective, no grid lines, no compass rose, no labels, grid-ready tileable surface, tabletop RPG battlemap, landscape orientation';

  static buildBattlemapPrompt(req: AIImageRequest): string {
    const styleDesc =
      (req.style && GeminiProvider.BATTLEMAP_STYLE_MAP[req.style])
        ? GeminiProvider.BATTLEMAP_STYLE_MAP[req.style]
        : (req.style ?? 'Fantasy illustrated battlemap, painterly');
    const parts: string[] = [req.prompt];
    if (req.locationDetails) parts.push(req.locationDetails);
    return `${styleDesc}: ${parts.join(', ')}. ${GeminiProvider.BATTLEMAP_CONSTRAINTS}`;
  }

  async generateBattlemap(req: AIImageRequest): Promise<GeneratedBinary> {
    const fullPrompt = GeminiProvider.buildBattlemapPrompt(req);
    let response;
    try {
      response = await this.imageGenai.models.generateContent({
        model: this.imageModel,
        contents: fullPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: { responseModalities: ['TEXT', 'IMAGE'], safetySettings: GeminiProvider.IMAGE_SAFETY_SETTINGS } as any,
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
      throw new AIInvalidPromptError('Vertex AI returned empty battlemap image payload');
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

  async generateMusic(req: AIMusicRequest): Promise<GeneratedBinary & { composedPrompt: string }> {
    const prompt = GeminiProvider.buildMusicPrompt(req);
    // Branch on model family — Lyria 3 lives on /interactions REST endpoint;
    // Lyria 2 lives on the legacy gRPC predict() path. Empirically verified
    // 2026-05-09: each model rejects the other's request shape (404/400).
    const binary = this.musicModel.startsWith('lyria-002')
      ? await this.generateMusicLegacy(prompt)
      : await this.generateMusicLyria3(prompt);
    return { ...binary, composedPrompt: prompt };
  }

  /**
   * Lyria 3 path (default): raw fetch to
   * `/v1beta1/projects/.../locations/global/interactions` with OAuth Bearer
   * token from `musicAuth`. Response shape: `{outputs:[{type:'audio',
   * mime_type:'audio/mpeg', data:'<base64>'}]}`.
   */
  /** Maps a non-OK Lyria3 HTTP response into our AI error taxonomy. Always throws. */
  private static throwLyria3HttpError(status: number, text: string): never {
    if (status === 429) throw new AIQuotaError();
    if (status === 400) throw new AIInvalidPromptError(text.slice(0, 200) || 'INVALID_ARGUMENT');
    if (status >= 500) throw new AINetworkError();
    throw new AIInvalidPromptError(`HTTP ${status}: ${text.slice(0, 200)}`);
  }

  private async generateMusicLyria3(prompt: string): Promise<GeneratedBinary> {
    const baseUrl =
      this.musicLocation === 'global'
        ? 'https://aiplatform.googleapis.com'
        : `https://${this.musicLocation}-aiplatform.googleapis.com`;
    const url = `${baseUrl}/v1beta1/projects/${this.musicProjectId}/locations/${this.musicLocation}/interactions`;

    let accessToken: string;
    try {
      accessToken = (await this.musicAuth.getAccessToken()) ?? '';
    } catch (err) {
      if (isNetworkError(err)) throw new AINetworkError();
      throw err;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ model: this.musicModel, input: [{ type: 'text', text: prompt }] }),
      });
    } catch {
      throw new AINetworkError();
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      GeminiProvider.throwLyria3HttpError(response.status, text);
    }

    return GeminiProvider.parseLyria3Response(response);
  }

  /**
   * Parses a successful Lyria 3 `/interactions` response and extracts the
   * first audio output part. Throws AIInvalidPromptError when the body
   * isn't valid JSON or the schema yields no audio payload.
   */
  private static async parseLyria3Response(response: Response): Promise<GeneratedBinary> {
    interface InteractionOutputPart {
      type?: string;
      mime_type?: string;
      mimeType?: string;
      data?: string;
    }
    interface InteractionResponse {
      outputs?: InteractionOutputPart[];
      status?: string;
    }
    let data: InteractionResponse;
    try {
      data = (await response.json()) as InteractionResponse;
    } catch {
      throw new AIInvalidPromptError('Vertex AI returned non-JSON response');
    }
    const audio = data.outputs?.find(
      (o) => o.type === 'audio' || (o.mime_type ?? o.mimeType ?? '').startsWith('audio/'),
    );
    if (!audio?.data) {
      throw new AIInvalidPromptError('Vertex AI returned empty audio payload');
    }
    return {
      bytes: Buffer.from(audio.data, 'base64'),
      mimeType: audio.mime_type ?? audio.mimeType ?? 'audio/mpeg',
    };
  }

  /**
   * Legacy Lyria 2 path: gRPC predict() against `lyria-002` at us-central1.
   * Reachable only when `GEMINI_MUSIC_MODEL=lyria-002` for emergency rollback.
   */
  private async generateMusicLegacy(prompt: string): Promise<GeneratedBinary> {
    let predictionResponse: { predictions?: unknown[] } = {};
    try {
      const [res] = await this.predictClient.predict({
        endpoint: `${this.musicEndpointBase}/${this.musicModel}`,
        instances: [helpers.toValue({ prompt }) as never],
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

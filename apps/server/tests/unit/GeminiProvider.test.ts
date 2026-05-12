import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import type { PredictionServiceClient } from '@google-cloud/aiplatform';
import type { GoogleGenAI } from '@google/genai';

// Stub the Google GenAI SDK class so the constructor branch that creates a
// real client never runs in tests. The provider always receives our injected
// fake via `opts.genai`.
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {},
}));

vi.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: class {},
  helpers: {
    toValue: (v: unknown) => v,
    fromValue: (v: unknown) => v,
  },
}));

// Stub GoogleAuth — Lyria 3 path needs an OAuth Bearer token but we never want
// real OAuth in unit tests. The fake `getAccessToken()` returns a static string.
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getAccessToken(): Promise<string> { return 'fake-access-token'; }
  },
}));

// Wraps a JS object in the same proto Value shape PredictionServiceClient
// emits at runtime (verified on Render: structValue → fields → stringValue).
function asProtoValue(obj: Record<string, string>): unknown {
  const fields: Record<string, { stringValue: string }> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = { stringValue: v };
  }
  return { structValue: { fields }, kind: 'structValue' };
}

const { GeminiProvider } = await import('../../src/infrastructure/ai/GeminiProvider.js');
const { AIQuotaError } = await import('../../src/infrastructure/ai/AIProvider.js');

// Minimal valid base64 JSON for service account credentials (parsed in constructor).
const FAKE_KEY = Buffer.from(
  JSON.stringify({ client_email: 'sa@x.iam', private_key: 'k' }),
  'utf-8',
).toString('base64');

interface GenAIMocks {
  generateContent: MockedFunction<GoogleGenAI['models']['generateContent']>;
}

interface PredictMocks {
  predict: MockedFunction<PredictionServiceClient['predict']>;
}

function makeGenAI(): { client: GoogleGenAI; mocks: GenAIMocks } {
  const mocks: GenAIMocks = { generateContent: vi.fn() };
  return {
    client: { models: { generateContent: mocks.generateContent } } as unknown as GoogleGenAI,
    mocks,
  };
}

function makePredict(): { client: PredictionServiceClient; mocks: PredictMocks } {
  const mocks: PredictMocks = { predict: vi.fn() };
  return { client: mocks as unknown as PredictionServiceClient, mocks };
}

function makeProvider(
  genai: GoogleGenAI,
  predict: PredictionServiceClient,
  cfgOverrides: Partial<{ musicModel: string; musicLocation: string }> = {},
): GeminiProvider {
  return new GeminiProvider(
    {
      projectId: 'p',
      location: 'global',
      serviceAccountKeyJson: FAKE_KEY,
      ...cfgOverrides,
    },
    { genai, predict },
  );
}

describe('GeminiProvider.generateText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns response.text from generateContent on the configured Gemini model', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    genaiMocks.generateContent.mockResolvedValue({ text: 'Hello, traveller.' } as never);

    const provider = makeProvider(genai, predict);
    const out = await provider.generateText({ system: '', history: [], user: 'greet a tavern keeper' });

    expect(out).toBe('Hello, traveller.');
    const callArg = genaiMocks.generateContent.mock.calls[0]?.[0] as { model?: string; contents?: unknown[] };
    expect(callArg.model).toBe('gemini-3-flash-preview');
    expect(Array.isArray(callArg.contents)).toBe(true);
  });

  it('passes systemInstruction + role-typed contents to Vertex SDK', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    genaiMocks.generateContent.mockResolvedValue({ text: 'ok' } as never);
    const provider = makeProvider(genai, predict);

    await provider.generateText({
      system: 'YOU ARE GM',
      history: [
        { role: 'user', content: 'past-1' },
        { role: 'assistant', content: 'past-2' },
      ],
      user: 'now',
    });

    const callArg = genaiMocks.generateContent.mock.calls[0]?.[0] as {
      config?: { systemInstruction?: { parts: { text: string }[] } };
      contents?: { role: string; parts: { text: string }[] }[];
    };
    // systemInstruction goes via config
    expect(callArg.config?.systemInstruction?.parts?.[0]?.text).toBe('YOU ARE GM');
    // contents has 3 turns: 2 history + current user; assistant→model role mapping applied
    expect(callArg.contents).toHaveLength(3);
    expect(callArg.contents?.[0]?.role).toBe('user');
    expect(callArg.contents?.[0]?.parts?.[0]?.text).toBe('past-1');
    expect(callArg.contents?.[1]?.role).toBe('model');
    expect(callArg.contents?.[1]?.parts?.[0]?.text).toBe('past-2');
    expect(callArg.contents?.[2]?.role).toBe('user');
    expect(callArg.contents?.[2]?.parts?.[0]?.text).toBe('now');
  });

  it('maps gRPC RESOURCE_EXHAUSTED (code 8) to AIQuotaError', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    const grpcErr: Error & { code?: number } = new Error('quota');
    grpcErr.code = 8;
    genaiMocks.generateContent.mockRejectedValue(grpcErr);

    const provider = makeProvider(genai, predict);
    await expect(provider.generateText({ system: '', history: [], user: 'x' })).rejects.toBeInstanceOf(AIQuotaError);
  });
});

describe('GeminiProvider.generateImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('decodes inlineData.data from generateContent into Buffer + mimeType', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    const png = Buffer.from([1, 2, 3, 4]);
    genaiMocks.generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: 'A medieval tavern, warm light.' },
              { inlineData: { data: png.toString('base64'), mimeType: 'image/png' } },
            ],
          },
        },
      ],
    } as never);

    const provider = makeProvider(genai, predict);
    const out = await provider.generateImage({ prompt: 'a forest', roomId: 'r' });

    expect(out.mimeType).toBe('image/png');
    expect(Buffer.compare(out.bytes, png)).toBe(0);
    const callArg = genaiMocks.generateContent.mock.calls[0]?.[0] as {
      model?: string;
      config?: { responseModalities?: string[] };
    };
    // Image model unification (Sync 2026-05-09): default is NB2 for both single-turn
    // and multi-turn paths, per Phase 2 target in AI_PROMPT_ENGINEERING_GUIDE.md.
    expect(callArg.model).toBe('gemini-3.1-flash-image-preview');
    expect(callArg.config?.responseModalities).toEqual(['TEXT', 'IMAGE']);
  });

  it('throws when no inlineData part is present in the response', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    genaiMocks.generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'only text' }] } }],
    } as never);
    const provider = makeProvider(genai, predict);
    await expect(
      provider.generateImage({ prompt: 'x', roomId: 'r' }),
    ).rejects.toThrow(/empty image payload/);
  });

  it('maps gRPC RESOURCE_EXHAUSTED (code 8) to AIQuotaError', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    const grpcErr: Error & { code?: number } = new Error('quota');
    grpcErr.code = 8;
    genaiMocks.generateContent.mockRejectedValue(grpcErr);
    const provider = makeProvider(genai, predict);
    await expect(
      provider.generateImage({ prompt: 'x', roomId: 'r' }),
    ).rejects.toBeInstanceOf(AIQuotaError);
  });
});

describe('GeminiProvider.generateMusic — Lyria 2 legacy path (rollback)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('decodes Lyria predict() proto-Value into Buffer + mimeType', async () => {
    const { client: genai } = makeGenAI();
    const { client: predict, mocks: predictMocks } = makePredict();
    const wav = Buffer.from([5, 6, 7, 8]);
    predictMocks.predict.mockResolvedValue([
      {
        predictions: [
          asProtoValue({ bytesBase64Encoded: wav.toString('base64'), mimeType: 'audio/wav' }),
        ],
      },
      undefined,
      undefined,
    ] as never);

    const provider = makeProvider(genai, predict, { musicModel: 'lyria-002' });
    const out = await provider.generateMusic({ prompt: 'tavern music', roomId: 'r1' });

    expect(out.mimeType).toBe('audio/wav');
    expect(Buffer.compare(out.bytes, wav)).toBe(0);
    const callArg = predictMocks.predict.mock.calls[0]?.[0] as { endpoint?: string };
    expect(callArg.endpoint).toContain('lyria-002');
    // Lyria 2 always uses the legacy us-central1 endpoint regardless of musicLocation.
    expect(callArg.endpoint).toContain('locations/us-central1');
  });

  it('throws when Lyria returns empty predictions', async () => {
    const { client: genai } = makeGenAI();
    const { client: predict, mocks: predictMocks } = makePredict();
    predictMocks.predict.mockResolvedValue([{ predictions: [] }, undefined, undefined] as never);
    const provider = makeProvider(genai, predict, { musicModel: 'lyria-002' });
    await expect(provider.generateMusic({ prompt: 'x', roomId: 'r1' })).rejects.toThrow(/empty audio payload/);
  });

  it('maps gRPC RESOURCE_EXHAUSTED (code 8) to AIQuotaError', async () => {
    const { client: genai } = makeGenAI();
    const { client: predict, mocks: predictMocks } = makePredict();
    const grpcErr: Error & { code?: number } = new Error('quota');
    grpcErr.code = 8;
    predictMocks.predict.mockRejectedValue(grpcErr);
    const provider = makeProvider(genai, predict, { musicModel: 'lyria-002' });
    await expect(provider.generateMusic({ prompt: 'x', roomId: 'r1' })).rejects.toBeInstanceOf(AIQuotaError);
  });
});

describe('GeminiProvider.generateMusic — Lyria 3 Clip default path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hits POST /v1beta1/.../locations/global/interactions with correct body shape and decodes audio', async () => {
    const mp3Bytes = Buffer.from([0xff, 0xfb, 0x90, 0x00]); // first MP3 frame header bytes
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        outputs: [
          { type: 'text',  text: 'placeholder' },
          { type: 'audio', mime_type: 'audio/mpeg', data: mp3Bytes.toString('base64') },
        ],
        status: 'completed',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const provider = makeProvider(genai, predict);
    const out = await provider.generateMusic({ prompt: 'cave ambient', roomId: 'r1' });

    expect(out.mimeType).toBe('audio/mpeg');
    expect(Buffer.compare(out.bytes, mp3Bytes)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://aiplatform.googleapis.com/v1beta1/projects/p/locations/global/interactions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { model: string; input: Array<{ type: string; text: string }> };
    expect(body.model).toBe('lyria-3-clip-preview');
    expect(body.input[0]?.type).toBe('text');
    // Confirms server-side formula is sent (hard constraints appended)
    expect(body.input[0]?.text).toContain('cave ambient');
    expect(body.input[0]?.text).toContain('no vocals');
  });

  it('throws AIQuotaError on HTTP 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limit', { status: 429 })));
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const provider = makeProvider(genai, predict);
    await expect(provider.generateMusic({ prompt: 'x', roomId: 'r1' })).rejects.toBeInstanceOf(AIQuotaError);
  });

  it('throws when /interactions returns no audio output (e.g. Pro async pattern)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ status: 'completed', id: 'abc' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const provider = makeProvider(genai, predict);
    await expect(provider.generateMusic({ prompt: 'x', roomId: 'r1' })).rejects.toThrow(/empty audio payload/);
  });
});

// Model-default regression tests (Sync 2026-05-09 image unification, back-on-spec).
// Pin the literal model identifiers so a casual edit to GeminiProvider's DEFAULT_*
// constants — or to the env-override fall-throughs — gets caught before merge.
// Pins the default model identifiers.
describe('GeminiProvider — default model identifiers', () => {
  beforeEach(() => vi.clearAllMocks());

  function readDefaults(provider: GeminiProvider): { textModel: string; imageModel: string; multiTurnImageModel: string; musicModel: string } {
    const p = provider as unknown as { textModel: string; imageModel: string; multiTurnImageModel: string; musicModel: string };
    return { textModel: p.textModel, imageModel: p.imageModel, multiTurnImageModel: p.multiTurnImageModel, musicModel: p.musicModel };
  }

  it('text default → gemini-3-flash-preview', () => {
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const defaults = readDefaults(makeProvider(genai, predict));
    expect(defaults.textModel).toBe('gemini-3-flash-preview');
  });

  it('single-turn image default → gemini-3.1-flash-image-preview (NB2, back-on-spec)', () => {
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const defaults = readDefaults(makeProvider(genai, predict));
    expect(defaults.imageModel).toBe('gemini-3.1-flash-image-preview');
  });

  it('multi-turn image default → gemini-3.1-flash-image-preview (NB2)', () => {
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const defaults = readDefaults(makeProvider(genai, predict));
    expect(defaults.multiTurnImageModel).toBe('gemini-3.1-flash-image-preview');
  });

  it('music default → lyria-3-clip-preview (Lyria 3 Clip, back-on-spec)', () => {
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const defaults = readDefaults(makeProvider(genai, predict));
    expect(defaults.musicModel).toBe('lyria-3-clip-preview');
  });

  it('music model can be env-overridden to lyria-002 for emergency rollback', () => {
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const defaults = readDefaults(makeProvider(genai, predict, { musicModel: 'lyria-002' }));
    expect(defaults.musicModel).toBe('lyria-002');
  });

  it('image models can be env-overridden independently for emergency rollback', () => {
    const { client: genai } = makeGenAI();
    const { client: predict } = makePredict();
    const provider = new GeminiProvider(
      {
        projectId: 'p',
        location: 'global',
        serviceAccountKeyJson: FAKE_KEY,
        imageModel: 'gemini-2.5-flash-image',
        multiTurnImageModel: 'gemini-2.5-flash-image',
      },
      { genai, predict },
    );
    const defaults = readDefaults(provider);
    expect(defaults.imageModel).toBe('gemini-2.5-flash-image');
    expect(defaults.multiTurnImageModel).toBe('gemini-2.5-flash-image');
  });
});

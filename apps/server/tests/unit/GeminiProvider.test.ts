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
): GeminiProvider {
  return new GeminiProvider(
    {
      projectId: 'p',
      location: 'global',
      serviceAccountKeyJson: FAKE_KEY,
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
    const out = await provider.generateText('greet a tavern keeper');

    expect(out).toBe('Hello, traveller.');
    const callArg = genaiMocks.generateContent.mock.calls[0]?.[0] as { model?: string };
    expect(callArg.model).toBe('gemini-3-flash-preview');
  });

  it('maps gRPC RESOURCE_EXHAUSTED (code 8) to AIQuotaError', async () => {
    const { client: genai, mocks: genaiMocks } = makeGenAI();
    const { client: predict } = makePredict();
    const grpcErr: Error & { code?: number } = new Error('quota');
    grpcErr.code = 8;
    genaiMocks.generateContent.mockRejectedValue(grpcErr);

    const provider = makeProvider(genai, predict);
    await expect(provider.generateText('x')).rejects.toBeInstanceOf(AIQuotaError);
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
    expect(callArg.model).toBe('gemini-2.5-flash-image');
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

describe('GeminiProvider.generateMusic', () => {
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

    const provider = makeProvider(genai, predict);
    const out = await provider.generateMusic({ prompt: 'tavern music' });

    expect(out.mimeType).toBe('audio/wav');
    expect(Buffer.compare(out.bytes, wav)).toBe(0);
    const callArg = predictMocks.predict.mock.calls[0]?.[0] as { endpoint?: string };
    expect(callArg.endpoint).toContain('lyria-002');
    // Lyria 2 lives in a regional endpoint (default us-central1), not global.
    expect(callArg.endpoint).toContain('locations/us-central1');
  });

  it('throws when Lyria returns empty predictions', async () => {
    const { client: genai } = makeGenAI();
    const { client: predict, mocks: predictMocks } = makePredict();
    predictMocks.predict.mockResolvedValue([{ predictions: [] }, undefined, undefined] as never);
    const provider = makeProvider(genai, predict);
    await expect(provider.generateMusic({ prompt: 'x' })).rejects.toThrow(/empty audio payload/);
  });

  it('maps gRPC RESOURCE_EXHAUSTED (code 8) to AIQuotaError', async () => {
    const { client: genai } = makeGenAI();
    const { client: predict, mocks: predictMocks } = makePredict();
    const grpcErr: Error & { code?: number } = new Error('quota');
    grpcErr.code = 8;
    predictMocks.predict.mockRejectedValue(grpcErr);
    const provider = makeProvider(genai, predict);
    await expect(provider.generateMusic({ prompt: 'x' })).rejects.toBeInstanceOf(AIQuotaError);
  });
});

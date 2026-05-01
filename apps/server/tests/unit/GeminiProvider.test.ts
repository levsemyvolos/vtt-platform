import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import type { PredictionServiceClient } from '@google-cloud/aiplatform';

vi.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: class {},
  helpers: {
    toValue: (v: unknown) => v,
    // Pass-through so unit tests can inject decoded JS objects directly.
    fromValue: (v: unknown) => v,
  },
}));

const { GeminiProvider } = await import('../../src/infrastructure/ai/GeminiProvider.js');
const { AIQuotaError } = await import('../../src/infrastructure/ai/AIProvider.js');

// Minimal valid base64 JSON for service account credentials (parsed in constructor).
const FAKE_KEY = Buffer.from(
  JSON.stringify({ client_email: 'sa@x.iam', private_key: 'k' }),
  'utf-8',
).toString('base64');

interface ClientMocks {
  predict: MockedFunction<PredictionServiceClient['predict']>;
}

function makeClient(): { client: PredictionServiceClient; mocks: ClientMocks } {
  const mocks: ClientMocks = { predict: vi.fn() };
  return { client: mocks as unknown as PredictionServiceClient, mocks };
}

function makeProvider(client: PredictionServiceClient): GeminiProvider {
  return new GeminiProvider(
    {
      projectId: 'p',
      location: 'us-central1',
      serviceAccountKeyJson: FAKE_KEY,
    },
    client,
  );
}

describe('GeminiProvider.generateImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('decodes base64 payload from Vertex AI predict() into Buffer + mimeType', async () => {
    const { client, mocks } = makeClient();
    const png = Buffer.from([1, 2, 3, 4]);
    mocks.predict.mockResolvedValue([
      {
        predictions: [
          { bytesBase64Encoded: png.toString('base64'), mimeType: 'image/png' },
        ],
      },
      undefined,
      undefined,
    ] as never);

    const provider = makeProvider(client);
    const out = await provider.generateImage({
      prompt: 'a forest',
      roomId: 'r',
    });

    expect(out.mimeType).toBe('image/png');
    expect(Buffer.compare(out.bytes, png)).toBe(0);
    const callArg = mocks.predict.mock.calls[0]?.[0] as { endpoint?: string };
    expect(callArg.endpoint).toContain('imagen-3.0-fast-generate-001');
  });

  it('maps gRPC RESOURCE_EXHAUSTED (code 8) to AIQuotaError', async () => {
    const { client, mocks } = makeClient();
    const grpcErr: Error & { code?: number } = new Error('quota');
    grpcErr.code = 8;
    mocks.predict.mockRejectedValue(grpcErr);

    const provider = makeProvider(client);
    await expect(
      provider.generateImage({ prompt: 'x', roomId: 'r' }),
    ).rejects.toBeInstanceOf(AIQuotaError);
  });

  it('throws when Vertex AI returns empty predictions', async () => {
    const { client, mocks } = makeClient();
    mocks.predict.mockResolvedValue([{ predictions: [] }, undefined, undefined] as never);
    const provider = makeProvider(client);
    await expect(
      provider.generateImage({ prompt: 'x', roomId: 'r' }),
    ).rejects.toThrow(/empty image payload/);
  });
});

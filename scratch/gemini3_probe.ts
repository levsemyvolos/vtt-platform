/**
 * Gemini 3 Flash + Nano Banana 2 availability re-probe.
 *
 * For each (model, region) pair, sends a minimal request and records:
 *   - HTTP-equivalent status (gRPC code)
 *   - Full error body (model-not-found vs invalid-request vs permission-denied)
 *   - Latency
 *   - Output shape on success
 *
 * Usage:
 *   pnpm exec tsx --env-file=apps/server/.env scratch/gemini3_probe.ts
 *
 * Fallback if tsx not on root path:
 *   pnpm --filter @vtt/server exec tsx --env-file=.env ../../scratch/gemini3_probe.ts
 */
import { GoogleGenAI } from '@google/genai';

interface ProbeResult {
  model: string;
  region: string;
  modality: 'text' | 'image';
  status: 'ok' | 'unavailable' | 'permission' | 'invalid_request' | 'safety' | 'error';
  grpcCode: number | string | null;
  httpStatus: number | null;
  latencyMs: number;
  detail: string;
  payloadKind: 'image_inline' | 'text_only' | 'empty' | 'n/a';
}

const TARGETS: Array<{ model: string; modality: 'text' | 'image'; note?: string }> = [
  { model: 'gemini-3-flash-preview', modality: 'text' },
  { model: 'gemini-3.1-flash-image-preview', modality: 'image' },
  // Speculative — was in old probe, keep to record exact error message:
  { model: 'gemini-3-pro-image', modality: 'image', note: 'speculative' },
  // Baseline (production models) for sanity check:
  { model: 'gemini-2.5-flash-image', modality: 'image', note: 'baseline' },
  { model: 'gemini-2.5-flash', modality: 'text', note: 'baseline' },
];

const REGIONS = ['us-central1', 'global'];

const TEXT_PROMPT = 'In one short sentence, describe a tavern at sunset.';
const IMAGE_PROMPT = 'A flat vector icon of a red dragon on white background.';

interface InlinePart {
  inlineData?: { data?: string; mimeType?: string };
  text?: string;
}

function classifyError(err: unknown): {
  status: ProbeResult['status'];
  grpcCode: number | string | null;
  httpStatus: number | null;
  detail: string;
} {
  const e = err as {
    code?: number | string;
    message?: string;
    status?: string | number;
    cause?: { code?: number; status?: number };
    response?: { status?: number; data?: unknown };
    details?: unknown;
    errorDetails?: unknown;
    statusDetails?: unknown;
  };

  // Capture as much of the raw error as possible
  let rawDetail: string;
  try {
    // Try to serialise the full error object
    const errorObj = {
      code: e.code,
      message: e.message,
      status: e.status,
      details: e.details,
      errorDetails: e.errorDetails,
      statusDetails: e.statusDetails,
      responseStatus: e.response?.status,
      responseData: e.response?.data,
    };
    rawDetail = JSON.stringify(errorObj, null, 0);
  } catch {
    rawDetail = String(err);
  }
  // Truncate to 800 chars to keep logs readable but informative
  const detail = rawDetail.slice(0, 800);

  const message = (e.message ?? String(err)).toLowerCase();
  const httpStatus = e.response?.status ?? null;
  const code = e.code ?? null;

  // gRPC codes: 5=NOT_FOUND, 7=PERMISSION_DENIED, 3=INVALID_ARGUMENT,
  //             9=FAILED_PRECONDITION, 8=RESOURCE_EXHAUSTED, 16=UNAUTHENTICATED
  let status: ProbeResult['status'] = 'error';

  if (
    code === 5 ||
    code === 'NOT_FOUND' ||
    message.includes('not found') ||
    message.includes('was not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  ) {
    status = 'unavailable';
  } else if (
    code === 7 ||
    code === 16 ||
    code === 'PERMISSION_DENIED' ||
    code === 'UNAUTHENTICATED' ||
    message.includes('permission') ||
    message.includes('iam') ||
    message.includes('unauthenticated') ||
    message.includes('403') ||
    message.includes('401') ||
    message.includes('billing')
  ) {
    status = 'permission';
  } else if (
    code === 9 ||
    code === 'FAILED_PRECONDITION' ||
    message.includes('failed_precondition') ||
    message.includes('precondition')
  ) {
    status = 'permission';
  } else if (
    code === 3 ||
    code === 'INVALID_ARGUMENT' ||
    message.includes('invalid') ||
    message.includes('400') ||
    message.includes('bad request')
  ) {
    status = 'invalid_request';
  }

  return { status, grpcCode: code, httpStatus, detail };
}

async function probeText(genai: GoogleGenAI, model: string, region: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const response = await genai.models.generateContent({
      model,
      contents: TEXT_PROMPT,
    });
    const latencyMs = Date.now() - start;
    const text = response.text;
    if (text && text.length > 0) {
      return {
        model,
        region,
        modality: 'text',
        status: 'ok',
        grpcCode: null,
        httpStatus: 200,
        latencyMs,
        detail: `len=${text.length} sample="${text.slice(0, 80)}"`,
        payloadKind: 'text_only',
      };
    }
    return {
      model,
      region,
      modality: 'text',
      status: 'error',
      grpcCode: null,
      httpStatus: 200,
      latencyMs,
      detail: 'empty text response',
      payloadKind: 'empty',
    };
  } catch (err) {
    const cls = classifyError(err);
    return { model, region, modality: 'text', latencyMs: Date.now() - start, payloadKind: 'n/a', ...cls };
  }
}

async function probeImage(genai: GoogleGenAI, model: string, region: string): Promise<ProbeResult> {
  const start = Date.now();
  // Per research brief: NB2 uses generationConfig.responseFormat.image.imageSize.
  // The SDK's `config` field maps to generationConfig at the wire level.
  // We use responseModalities (which all image models accept) — if that yields a 400,
  // the error body will name the bad field and tell us the correct shape.
  try {
    const response = await genai.models.generateContent({
      model,
      contents: IMAGE_PROMPT,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        // NB2 new shape: responseFormat.image.imageSize — include alongside legacy modalities
        // so we get a signal whether the model accepts both or only one shape.
        responseFormat: {
          image: {
            aspectRatio: '1:1',
            imageSize: '1K',
          },
        },
      },
    });
    const latencyMs = Date.now() - start;
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlinePart[];
    const finishReason = response.candidates?.[0]?.finishReason ?? 'UNKNOWN';

    if (
      finishReason === 'SAFETY' ||
      finishReason === 'PROHIBITED_CONTENT' ||
      finishReason === 'BLOCKLIST'
    ) {
      return {
        model,
        region,
        modality: 'image',
        status: 'safety',
        grpcCode: null,
        httpStatus: 200,
        latencyMs,
        detail: `finishReason=${finishReason}`,
        payloadKind: 'n/a',
      };
    }

    const inline = parts.find((p) => p.inlineData?.data);
    if (inline?.inlineData?.data) {
      const sizeBytes = Buffer.from(inline.inlineData.data, 'base64').length;
      return {
        model,
        region,
        modality: 'image',
        status: 'ok',
        grpcCode: null,
        httpStatus: 200,
        latencyMs,
        detail: `mime=${inline.inlineData.mimeType ?? '?'} size=${sizeBytes}B finishReason=${finishReason}`,
        payloadKind: 'image_inline',
      };
    }

    if (parts.some((p) => typeof p.text === 'string' && p.text.length > 0)) {
      return {
        model,
        region,
        modality: 'image',
        status: 'ok',
        grpcCode: null,
        httpStatus: 200,
        latencyMs,
        detail: `text-only response, finishReason=${finishReason}`,
        payloadKind: 'text_only',
      };
    }

    return {
      model,
      region,
      modality: 'image',
      status: 'error',
      grpcCode: null,
      httpStatus: 200,
      latencyMs,
      detail: `empty payload, finishReason=${finishReason}`,
      payloadKind: 'empty',
    };
  } catch (err) {
    const cls = classifyError(err);
    return { model, region, modality: 'image', latencyMs: Date.now() - start, payloadKind: 'n/a', ...cls };
  }
}

async function main(): Promise<void> {
  const projectId = process.env['GCP_PROJECT_ID'];
  const keyJson = process.env['GCP_SERVICE_ACCOUNT_KEY'];
  if (!projectId || !keyJson) {
    console.error('Missing GCP_PROJECT_ID / GCP_SERVICE_ACCOUNT_KEY in env.');
    process.exit(1);
  }
  const credentials = JSON.parse(Buffer.from(keyJson, 'base64').toString('utf-8')) as {
    client_email: string;
    private_key: string;
  };

  console.log(`# Gemini 3 + NB2 availability re-probe`);
  console.log(`Project: ${projectId}`);
  console.log(`Targets: ${TARGETS.map((t) => `${t.model}(${t.modality}${t.note ? '/' + t.note : ''})`).join(', ')}`);
  console.log(`Regions: ${REGIONS.join(', ')}`);
  console.log('');

  const results: ProbeResult[] = [];

  for (const region of REGIONS) {
    console.log(`--- Region: ${region} ---`);
    const genai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: region,
      googleAuthOptions: { credentials },
    });

    for (const target of TARGETS) {
      const label = `[${region}] ${target.model}(${target.modality}${target.note ? '/' + target.note : ''})`;
      process.stdout.write(`${label} ... `);
      const r =
        target.modality === 'text'
          ? await probeText(genai, target.model, region)
          : await probeImage(genai, target.model, region);
      console.log(
        `${r.status} [${r.latencyMs}ms] code=${r.grpcCode ?? '-'} http=${r.httpStatus ?? '-'}`
      );
      console.log(`    detail: ${r.detail}`);
      results.push(r);
    }
    console.log('');
  }

  console.log('=== JSON DUMP ===');
  console.log(JSON.stringify(results, null, 2));
}

void main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});

/**
 * Nano Banana availability probe — Session 1.2.B (AI panel rework).
 *
 * Sends the same minimal prompt to three Vertex AI image models and reports
 * which ones are reachable on the service account configured in
 * apps/server/.env. Result is stored in
 * `_chats_and_ai/plans/ai_rework_nano_banana_rnd.md`.
 *
 * Usage:
 *   pnpm exec tsx --env-file=apps/server/.env scratch/nano_banana_probe.ts
 */
import { GoogleGenAI } from '@google/genai';

interface ProbeResult {
  model: string;
  status: 'ok' | 'safety_block' | 'unavailable' | 'error';
  latencyMs: number;
  detail: string;
  payloadKind: 'image_inline' | 'text_only' | 'empty' | 'n/a';
}

const MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image',
];

const PROMPT = 'A simple icon of a red dragon, white background, flat vector style.';

interface InlinePart {
  inlineData?: { data?: string; mimeType?: string };
  text?: string;
}

async function probe(genai: GoogleGenAI, model: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const response = await genai.models.generateContent({
      model,
      contents: PROMPT,
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const latencyMs = Date.now() - start;
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlinePart[];
    const finishReason = response.candidates?.[0]?.finishReason ?? 'UNKNOWN';
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT' || finishReason === 'BLOCKLIST') {
      return { model, status: 'safety_block', latencyMs, detail: `finishReason=${finishReason}`, payloadKind: 'n/a' };
    }
    const inline = parts.find((p) => p.inlineData?.data);
    if (inline) {
      const sizeBytes = Buffer.from(inline.inlineData!.data!, 'base64').length;
      return {
        model,
        status: 'ok',
        latencyMs,
        detail: `mime=${inline.inlineData!.mimeType ?? '?'} size=${sizeBytes}B finishReason=${finishReason}`,
        payloadKind: 'image_inline',
      };
    }
    if (parts.some((p) => typeof p.text === 'string' && p.text.length > 0)) {
      return { model, status: 'ok', latencyMs, detail: `text-only response, finishReason=${finishReason}`, payloadKind: 'text_only' };
    }
    return { model, status: 'error', latencyMs, detail: `empty payload, finishReason=${finishReason}`, payloadKind: 'empty' };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errAny = err as { code?: number; message?: string; status?: string };
    const code = errAny.code;
    const message = errAny.message ?? String(err);
    // gRPC code 5 = NOT_FOUND, code 7 = PERMISSION_DENIED, code 9 = FAILED_PRECONDITION (often "model not available")
    if (code === 5 || code === 7 || code === 9) {
      return { model, status: 'unavailable', latencyMs, detail: `code=${code} ${message.slice(0, 200)}`, payloadKind: 'n/a' };
    }
    return { model, status: 'error', latencyMs, detail: `code=${code ?? 'n/a'} ${message.slice(0, 200)}`, payloadKind: 'n/a' };
  }
}

async function main(): Promise<void> {
  const projectId = process.env['GCP_PROJECT_ID'];
  const location = process.env['GCP_LOCATION'] ?? 'us-central1';
  const keyJson = process.env['GCP_SERVICE_ACCOUNT_KEY'];
  if (!projectId || !keyJson) {
    console.error('Missing GCP_PROJECT_ID / GCP_SERVICE_ACCOUNT_KEY in env.');
    process.exit(1);
  }
  const credentials = JSON.parse(Buffer.from(keyJson, 'base64').toString('utf-8')) as {
    client_email: string;
    private_key: string;
  };

  const genai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location,
    googleAuthOptions: { credentials },
  });

  console.log(`# Nano Banana availability probe`);
  console.log(`Project: ${projectId} · Location: ${location}`);
  console.log('');
  const results: ProbeResult[] = [];
  for (const model of MODELS) {
    process.stdout.write(`Probing ${model} ... `);
    const r = await probe(genai, model);
    console.log(`${r.status} [${r.latencyMs}ms] ${r.detail}`);
    results.push(r);
  }
  console.log('');
  console.log('JSON:');
  console.log(JSON.stringify(results, null, 2));
}

void main();

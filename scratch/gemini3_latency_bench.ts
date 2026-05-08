/**
 * Latency benchmark — 3 sequential calls to each new model in `global` to
 * separate cold-start from steady-state latency. Single sample isn't enough
 * to know if 15.9s NB2 was just cold-start.
 *
 * Usage (from apps/server, where tsx + @google/genai are installed):
 *   pnpm exec tsx --env-file=.env ../../scratch/gemini3_latency_bench.ts
 */
import { GoogleGenAI } from '@google/genai';

const TEXT_PROMPT = 'In one short sentence, describe a tavern at sunset.';
const IMAGE_PROMPT = 'A flat vector icon of a red dragon on white background.';
const N = 3;

interface InlinePart {
  inlineData?: { data?: string };
  text?: string;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function benchText(genai: GoogleGenAI, model: string): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const start = Date.now();
    try {
      const response = await genai.models.generateContent({ model, contents: TEXT_PROMPT });
      void response.text;
    } catch (err) {
      console.error(`[${model}] call ${i + 1} failed:`, (err as Error).message);
    }
    const ms = Date.now() - start;
    samples.push(ms);
    console.log(`  ${model} call ${i + 1}: ${ms}ms`);
  }
  return samples;
}

async function benchImage(genai: GoogleGenAI, model: string): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const start = Date.now();
    try {
      const response = await genai.models.generateContent({
        model,
        contents: IMAGE_PROMPT,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlinePart[];
      const ok = parts.some((p) => p.inlineData?.data);
      if (!ok) console.warn(`[${model}] call ${i + 1}: no inline image returned`);
    } catch (err) {
      console.error(`[${model}] call ${i + 1} failed:`, (err as Error).message);
    }
    const ms = Date.now() - start;
    samples.push(ms);
    console.log(`  ${model} call ${i + 1}: ${ms}ms`);
  }
  return samples;
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

  const genai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: 'global',
    googleAuthOptions: { credentials },
  });

  console.log('# Latency benchmark — global region, N=3 sequential calls per model\n');

  console.log('## gemini-3-flash-preview (text)');
  const textNew = await benchText(genai, 'gemini-3-flash-preview');
  console.log(`  median: ${median(textNew)}ms\n`);

  console.log('## gemini-2.5-flash (text baseline)');
  const textBase = await benchText(genai, 'gemini-2.5-flash');
  console.log(`  median: ${median(textBase)}ms\n`);

  console.log('## gemini-3.1-flash-image-preview (image)');
  const imgNew = await benchImage(genai, 'gemini-3.1-flash-image-preview');
  console.log(`  median: ${median(imgNew)}ms\n`);

  console.log('## gemini-2.5-flash-image (image baseline)');
  const imgBase = await benchImage(genai, 'gemini-2.5-flash-image');
  console.log(`  median: ${median(imgBase)}ms\n`);

  console.log('## Summary');
  console.log(`  text   new/base median: ${median(textNew)}ms vs ${median(textBase)}ms`);
  console.log(`  image  new/base median: ${median(imgNew)}ms vs ${median(imgBase)}ms`);
}

void main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});

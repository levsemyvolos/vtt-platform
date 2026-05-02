import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// pnpm hoists @3d-dice/dice-box to apps/client/node_modules (not monorepo root)
const src = resolve(__dirname, '../node_modules/@3d-dice/dice-box/dist/assets');
const dst = resolve(__dirname, '../public/assets/dice-box');

if (!existsSync(src)) {
  console.error(`[copy-dice-box-assets] source not found: ${src}`);
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`[copy-dice-box-assets] copied ${src} → ${dst}`);

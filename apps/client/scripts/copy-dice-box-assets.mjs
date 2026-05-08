import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// New lib (@3d-dice/dice-box-threejs) hardcodes asset URLs as "textures/..." and
// "sounds/...", so they must live at the Vite public root (served at "/").
const pkgPublic = resolve(__dirname, '../node_modules/@3d-dice/dice-box-threejs/public');
const dstTextures = resolve(__dirname, '../public/textures');
const dstSounds = resolve(__dirname, '../public/sounds');

if (!existsSync(pkgPublic)) {
  console.error(`[copy-dice-box-assets] source not found: ${pkgPublic}`);
  process.exit(1);
}

// Clean up assets dir from the old @3d-dice/dice-box library, if present.
const oldDir = resolve(__dirname, '../public/assets/dice-box');
if (existsSync(oldDir)) {
  rmSync(oldDir, { recursive: true, force: true });
}

mkdirSync(dstTextures, { recursive: true });
mkdirSync(dstSounds, { recursive: true });
cpSync(resolve(pkgPublic, 'textures'), dstTextures, { recursive: true });
cpSync(resolve(pkgPublic, 'sounds'), dstSounds, { recursive: true });
console.log('[copy-dice-box-assets] copied dice-box-threejs assets to public/{textures,sounds}');

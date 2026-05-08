import { test, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('dice-box-threejs assets are present in public/ after postinstall', () => {
  const textures = resolve(__dirname, '../../../../public/textures');
  expect(existsSync(textures)).toBe(true);
  const sounds = resolve(__dirname, '../../../../public/sounds');
  expect(existsSync(sounds)).toBe(true);
});

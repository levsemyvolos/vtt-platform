import { test, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('dice-box assets are present in public/ after postinstall', () => {
  const json = resolve(__dirname, '../../../../public/assets/dice-box/themes/default/default.json');
  expect(existsSync(json)).toBe(true);
});

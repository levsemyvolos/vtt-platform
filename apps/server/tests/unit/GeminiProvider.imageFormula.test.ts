import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../../src/infrastructure/ai/GeminiProvider.js';

/**
 * S4.1 — P2.1 Scene Background formula unit tests.
 *
 * Tests pin `GeminiProvider.buildSceneBackgroundPrompt()` without constructing
 * a real provider instance (static method, no GCP credentials required).
 */

const CONSTRAINTS = 'tabletop RPG scene illustration, no text, no logos, no UI overlays, no watermarks, landscape orientation';

describe('GeminiProvider.buildSceneBackgroundPrompt — S4.1 (P2.1)', () => {
  it('subject only, no style → fallback style descriptor + constraints', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'dark dungeon corridor',
      roomId: 'r1',
    });
    expect(result).toContain('dark dungeon corridor');
    expect(result).toContain(CONSTRAINTS);
    expect(result).not.toMatch(/^undefined/);
  });

  it('fantasy style maps to SCENE_STYLE_MAP descriptor', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'elven forest glade',
      roomId: 'r1',
      style: 'fantasy',
    });
    expect(result.startsWith('Fantasy digital illustration, painterly:')).toBe(true);
    expect(result).toContain('elven forest glade');
    expect(result).toContain(CONSTRAINTS);
  });

  it('realistic style maps correctly', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'city square at dusk',
      roomId: 'r1',
      style: 'realistic',
    });
    expect(result.startsWith('Photorealistic, highly detailed:')).toBe(true);
  });

  it('sci-fi style maps correctly', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'space station corridor',
      roomId: 'r1',
      style: 'sci-fi',
    });
    expect(result.startsWith('Science fiction concept art, cinematic:')).toBe(true);
  });

  it('dark-fantasy style maps correctly', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'cursed swamp',
      roomId: 'r1',
      style: 'dark-fantasy',
    });
    expect(result.startsWith('Tabletop RPG dark fantasy illustration, atmospheric:')).toBe(true);
  });

  it('watercolor style maps correctly', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'cottage garden',
      roomId: 'r1',
      style: 'watercolor',
    });
    expect(result.startsWith('Watercolor painting, artistic:')).toBe(true);
  });

  it('unknown style key is preserved as-is', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'market square',
      roomId: 'r1',
      style: 'custom-style-xyz',
    });
    expect(result.startsWith('custom-style-xyz:')).toBe(true);
    expect(result).toContain('market square');
    expect(result).toContain(CONSTRAINTS);
  });

  it('all 5 structured fields appear in output in correct relative order', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'ancient library',
      roomId: 'r1',
      style: 'fantasy',
      composition: 'wide establishing shot',
      locationDetails: 'towering bookshelves and floating candles',
      lighting: 'candlelight torchlight',
      palette: 'warm amber hues',
    });
    const subject    = result.indexOf('ancient library');
    const compos     = result.indexOf('wide establishing shot');
    const locDetails = result.indexOf('towering bookshelves and floating candles');
    const light      = result.indexOf('candlelight torchlight');
    const pal        = result.indexOf('warm amber hues');
    // All fields present
    expect(subject).toBeGreaterThan(-1);
    expect(compos).toBeGreaterThan(-1);
    expect(locDetails).toBeGreaterThan(-1);
    expect(light).toBeGreaterThan(-1);
    expect(pal).toBeGreaterThan(-1);
    // Relative order preserved
    expect(subject).toBeLessThan(compos);
    expect(compos).toBeLessThan(locDetails);
    expect(locDetails).toBeLessThan(light);
    expect(light).toBeLessThan(pal);
    expect(result).toContain(CONSTRAINTS);
  });

  it('partial fields (composition only) — missing parts not appended', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'throne room',
      roomId: 'r1',
      style: 'fantasy',
      composition: "bird's-eye view overhead",
    });
    expect(result).toContain('throne room');
    expect(result).toContain("bird's-eye view overhead");
    expect(result).not.toContain('undefined');
    expect(result).toContain(CONSTRAINTS);
  });

  it('empty-string optional fields are not appended as blank tokens', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'mountain pass',
      roomId: 'r1',
      style: 'realistic',
      composition: '',
      lighting: '',
      palette: '',
    });
    expect(result).not.toMatch(/, ,/);
    expect(result).not.toMatch(/: ,/);
    expect(result).toContain('mountain pass');
  });

  it('SCENE_CONSTRAINTS always appended at end of string', () => {
    const result = GeminiProvider.buildSceneBackgroundPrompt({
      prompt: 'test subject',
      roomId: 'r1',
      style: 'watercolor',
    });
    expect(result.endsWith(CONSTRAINTS)).toBe(true);
  });
});

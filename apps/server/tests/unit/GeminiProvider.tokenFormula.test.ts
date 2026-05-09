import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../../src/infrastructure/ai/GeminiProvider.js';

/**
 * S4.2 — P2.2 Token image formula unit tests (framing selectors + circle-clip wording).
 *
 * Tests pin `GeminiProvider.buildTokenPrompt()` without constructing
 * a real provider instance (static method, no GCP credentials required).
 */

const TOKEN_CONSTRAINTS = 'tabletop RPG character token art, neutral pose, clean solid white background, centered composition, circular crop friendly, no text, no logos, no watermarks';

describe('GeminiProvider.buildTokenPrompt — S4.2 (P2.2)', () => {
  it('subject only, no style → fallback style descriptor + constraints', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'human warrior with a shield',
      roomId: 'r1',
    });
    expect(result).toContain('human warrior with a shield');
    expect(result).toContain(TOKEN_CONSTRAINTS);
    expect(result).not.toMatch(/^undefined/);
  });

  it('fantasy style maps to TOKEN_STYLE_MAP descriptor', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'elven ranger',
      roomId: 'r1',
      style: 'fantasy',
    });
    expect(result.startsWith('Fantasy character illustration, detailed:')).toBe(true);
    expect(result).toContain('elven ranger');
    expect(result).toContain(TOKEN_CONSTRAINTS);
  });

  it('realistic style maps correctly', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'dwarven blacksmith',
      roomId: 'r1',
      style: 'realistic',
    });
    expect(result.startsWith('Photorealistic portrait, highly detailed:')).toBe(true);
  });

  it('sci-fi style maps correctly', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'space marine in power armour',
      roomId: 'r1',
      style: 'sci-fi',
    });
    expect(result.startsWith('Science fiction character art, cinematic:')).toBe(true);
  });

  it('dark-fantasy style maps correctly', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'undead necromancer',
      roomId: 'r1',
      style: 'dark-fantasy',
    });
    expect(result.startsWith('Dark fantasy character art, dramatic:')).toBe(true);
  });

  it('unknown style key preserved as-is', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'goblin merchant',
      roomId: 'r1',
      style: 'oil-painting',
    });
    expect(result.startsWith('oil-painting:')).toBe(true);
    expect(result).toContain('goblin merchant');
    expect(result).toContain(TOKEN_CONSTRAINTS);
  });

  it('TOKEN_CONSTRAINTS always appended at end', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'test character',
      roomId: 'r1',
      style: 'watercolor',
    });
    expect(result.endsWith(TOKEN_CONSTRAINTS)).toBe(true);
  });

  // Framing tests (UX fix)
  it('no tokenFraming → full-body view by default', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'paladin',
      roomId: 'r1',
      style: 'fantasy',
    });
    expect(result).toContain('full-body view');
    expect(result).not.toContain('bust portrait');
    expect(result).not.toContain('half-body portrait');
  });

  it('tokenFraming=bust → bust portrait, head and shoulders only', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'wizard',
      roomId: 'r1',
      style: 'fantasy',
      tokenFraming: 'bust',
    });
    expect(result).toContain('bust portrait, head and shoulders only');
    expect(result).not.toContain('full-body view');
  });

  it('tokenFraming=half-body → half-body portrait, waist up', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'rogue',
      roomId: 'r1',
      style: 'dark-fantasy',
      tokenFraming: 'half-body',
    });
    expect(result).toContain('half-body portrait, waist up');
    expect(result).not.toContain('full-body view');
  });

  it('tokenFraming=full-body → explicit full-body view', () => {
    const result = GeminiProvider.buildTokenPrompt({
      prompt: 'barbarian',
      roomId: 'r1',
      style: 'realistic',
      tokenFraming: 'full-body',
    });
    expect(result).toContain('full-body view');
  });

  it('structured scene fields (composition/locationDetails/etc.) are ignored — token formula is fixed', () => {
    const withFields = GeminiProvider.buildTokenPrompt({
      prompt: 'halfling rogue',
      roomId: 'r1',
      style: 'cartoon',
      composition: 'bird\'s-eye view',
      locationDetails: 'dungeon corridor',
      lighting: 'torchlight',
      palette: 'warm tones',
    });
    const withoutFields = GeminiProvider.buildTokenPrompt({
      prompt: 'halfling rogue',
      roomId: 'r1',
      style: 'cartoon',
    });
    // Token formula ignores scene-specific structured fields
    expect(withFields).toBe(withoutFields);
  });

  it('circular crop hint present — TOKEN_CONSTRAINTS guides composition for circle clip, no decorative border wording', () => {
    // AI should compose with circular crop in mind; server applies the actual clip.
    // "no circular border" / "no decorative frame" were removed — they're irrelevant
    // once the server does the clip server-side via circleClipPng().
    expect(TOKEN_CONSTRAINTS).toContain('circular crop friendly');
    expect(TOKEN_CONSTRAINTS).not.toContain('no circular border');
    expect(TOKEN_CONSTRAINTS).not.toContain('no decorative frame');
  });
});

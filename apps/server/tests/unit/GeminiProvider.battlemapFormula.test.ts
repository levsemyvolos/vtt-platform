import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../../src/infrastructure/ai/GeminiProvider.js';

/**
 * S4.3 — P2.3 Battlemap image formula unit tests.
 *
 * Tests pin `GeminiProvider.buildBattlemapPrompt()` without constructing
 * a real provider instance (static method, no GCP credentials required).
 */

const BATTLEMAP_CONSTRAINTS = 'true top-down orthographic view, no perspective, no grid lines, no compass rose, no labels, grid-ready tileable surface, tabletop RPG battlemap, landscape orientation';

describe('GeminiProvider.buildBattlemapPrompt — S4.3 (P2.3)', () => {
  it('location only, no style → fallback style descriptor + constraints', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'stone dungeon room',
      roomId: 'r1',
    });
    expect(result).toContain('stone dungeon room');
    expect(result).toContain(BATTLEMAP_CONSTRAINTS);
    expect(result).not.toMatch(/^undefined/);
  });

  it('fantasy style maps to BATTLEMAP_STYLE_MAP descriptor', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'forest clearing with ancient ruins',
      roomId: 'r1',
      style: 'fantasy',
    });
    expect(result.startsWith('Fantasy illustrated battlemap, painterly:')).toBe(true);
    expect(result).toContain('forest clearing with ancient ruins');
    expect(result).toContain(BATTLEMAP_CONSTRAINTS);
  });

  it('realistic style maps correctly', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'city street',
      roomId: 'r1',
      style: 'realistic',
    });
    expect(result.startsWith('Realistic battlemap, highly detailed:')).toBe(true);
  });

  it('sci-fi style maps correctly', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'space station corridor',
      roomId: 'r1',
      style: 'sci-fi',
    });
    expect(result.startsWith('Science fiction battlemap, concept art style:')).toBe(true);
  });

  it('dark-fantasy style maps correctly', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'cursed cemetery',
      roomId: 'r1',
      style: 'dark-fantasy',
    });
    expect(result.startsWith('Dark fantasy battlemap, dramatic:')).toBe(true);
  });

  it('watercolor style maps correctly', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'coastal harbour',
      roomId: 'r1',
      style: 'watercolor',
    });
    expect(result.startsWith('Watercolor illustrated battlemap, artistic:')).toBe(true);
  });

  it('unknown style key preserved as-is', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'tavern interior',
      roomId: 'r1',
      style: 'isometric-pixel',
    });
    expect(result.startsWith('isometric-pixel:')).toBe(true);
    expect(result).toContain('tavern interior');
    expect(result).toContain(BATTLEMAP_CONSTRAINTS);
  });

  it('BATTLEMAP_CONSTRAINTS always appended at end', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'swamp',
      roomId: 'r1',
      style: 'cartoon',
    });
    expect(result.endsWith(BATTLEMAP_CONSTRAINTS)).toBe(true);
  });

  it('locationDetails (environment preset) is appended to the prompt parts', () => {
    const result = GeminiProvider.buildBattlemapPrompt({
      prompt: 'large open area',
      roomId: 'r1',
      style: 'fantasy',
      locationDetails: 'dungeon corridor',
    });
    expect(result).toContain('large open area');
    expect(result).toContain('dungeon corridor');
    // locationDetails appears after prompt
    expect(result.indexOf('large open area')).toBeLessThan(result.indexOf('dungeon corridor'));
  });

  it('composition/lighting/palette are ignored — battlemap formula is fixed top-down', () => {
    const withSceneFields = GeminiProvider.buildBattlemapPrompt({
      prompt: 'open grassland',
      roomId: 'r1',
      style: 'fantasy',
      composition: "bird's-eye view",
      lighting: 'golden hour sunlight',
      palette: 'warm tones',
    });
    const withoutSceneFields = GeminiProvider.buildBattlemapPrompt({
      prompt: 'open grassland',
      roomId: 'r1',
      style: 'fantasy',
    });
    // Battlemap formula ignores composition/lighting/palette — top-down is enforced by constraints
    expect(withSceneFields).toBe(withoutSceneFields);
  });
});

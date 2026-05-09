import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../../src/infrastructure/ai/GeminiProvider.js';

/**
 * S5.1 — P3 Music formula unit tests.
 *
 * Tests pin `GeminiProvider.buildMusicPrompt()` without constructing
 * a real provider instance (static method, no GCP credentials required).
 */

const HARD_CONSTRAINTS = GeminiProvider.MUSIC_HARD_CONSTRAINTS;

describe('GeminiProvider.buildMusicPrompt — S5.1 (P3)', () => {
  it('legacy path: raw prompt + hard constraints appended when no structured fields', () => {
    const result = GeminiProvider.buildMusicPrompt({
      prompt: 'dark ambient music for a dungeon',
      roomId: 'r1',
    });
    expect(result).toContain('dark ambient music for a dungeon');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('legacy path: skips duplicate hard constraints if already present', () => {
    const result = GeminiProvider.buildMusicPrompt({
      prompt: 'beatless ambient, no vocals, instrumental only',
      roomId: 'r1',
    });
    expect(result).toContain('beatless ambient');
    expect((result.match(/no vocals/g) ?? []).length).toBe(1);
  });

  it('cave preset produces scene type, genre, mood, instrumentation, tempo, dynamics, ambiance, structure, hard constraints', () => {
    const result = GeminiProvider.buildMusicPrompt({ prompt: '', roomId: 'r1', presetKey: 'cave' });
    expect(result).toContain('cave system');
    expect(result).toContain('Genre/Style: dark ambient soundscape.');
    expect(result).toContain('eerie, tense, claustrophobic');
    expect(result).toContain('sub-bass drones');
    expect(result).toContain('Tempo/Rhythm:');
    expect(result).toContain('Dynamics:');
    expect(result).toContain('Ambiance/Sound design:');
    expect(result).toContain('Structure:');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('tavern preset contains folk instrumentation', () => {
    const result = GeminiProvider.buildMusicPrompt({ prompt: '', roomId: 'r1', presetKey: 'tavern' });
    expect(result).toContain('tavern');
    expect(result).toContain('lute');
    expect(result).toContain('warm, convivial');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('exploration preset contains orchestral underscore elements', () => {
    const result = GeminiProvider.buildMusicPrompt({ prompt: '', roomId: 'r1', presetKey: 'exploration' });
    expect(result).toContain('wilderness travel');
    expect(result).toContain('bowed strings');
    expect(result).toContain('contemplative');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('tension preset contains brass and staccato strings', () => {
    const result = GeminiProvider.buildMusicPrompt({ prompt: '', roomId: 'r1', presetKey: 'tension' });
    expect(result).toContain('suspenseful');
    expect(result).toContain('brass swells');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('combat preset contains orchestral drums and driving tempo', () => {
    const result = GeminiProvider.buildMusicPrompt({ prompt: '', roomId: 'r1', presetKey: 'combat' });
    expect(result).toContain('combat encounter');
    expect(result).toContain('120–140 BPM');
    expect(result).toContain('string ostinato');
    expect(result).toContain(HARD_CONSTRAINTS);
    // combat has no ambiance — line should not be present
    expect(result).not.toContain('Ambiance/Sound design:');
  });

  it('user mood override replaces preset mood', () => {
    const result = GeminiProvider.buildMusicPrompt({
      prompt: '',
      roomId: 'r1',
      presetKey: 'cave',
      mood: 'joyful and bright',
    });
    expect(result).toContain('joyful and bright');
    expect(result).not.toContain('eerie, tense');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('user instrumentation override replaces preset instrumentation', () => {
    const result = GeminiProvider.buildMusicPrompt({
      prompt: '',
      roomId: 'r1',
      presetKey: 'tavern',
      instrumentation: 'solo piano',
    });
    expect(result).toContain('solo piano');
    expect(result).not.toContain('lute');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('custom mode (no preset, mood provided) uses generic scene type + hard constraints', () => {
    const result = GeminiProvider.buildMusicPrompt({
      prompt: '',
      roomId: 'r1',
      mood: 'melancholic and longing',
      instrumentation: 'solo violin and cello',
    });
    expect(result).toContain('tabletop RPG session');
    expect(result).toContain('melancholic and longing');
    expect(result).toContain('solo violin and cello');
    expect(result).toContain(HARD_CONSTRAINTS);
  });

  it('hard constraints always appear at end of assembled prompt', () => {
    const result = GeminiProvider.buildMusicPrompt({ prompt: '', roomId: 'r1', presetKey: 'exploration' });
    const idx = result.lastIndexOf(HARD_CONSTRAINTS);
    expect(idx).toBeGreaterThan(-1);
    // Nothing meaningful after the constraints line
    const after = result.slice(idx + HARD_CONSTRAINTS.length).trim();
    expect(after).toBe('.');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService, computeMusicDisplayName } from '../../src/services/AIService.js';
import type { AIProvider } from '../../src/infrastructure/ai/AIProvider.js';
import type { AssetService } from '../../src/services/AssetService.js';
import type { AIMusicRequest } from '@vtt/shared';

/**
 * Auto-naming for AI music Asset.
 *
 * Lyria's `/interactions` response has no `name`/`title` field, only raw
 * audio bytes. The display title therefore must be derived from the request.
 * This suite pins the priority order: mood → preset → prompt → fallback.
 *
 * Also pins the integration: AIService.generateMusic must pass the
 * provider-returned `composedPrompt` (full 8-line Lyria prompt) and the
 * derived `displayName` through to AssetService.storeAiAsset, so history
 * rows show a readable name and provenance preserves the actual sent prompt
 * (rather than the empty UI `req.prompt` field under the structured-fields
 * preset flow).
 */

const ROOM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('computeMusicDisplayName', () => {
  it('returns first 1-2 words of mood, title-cased', () => {
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM,
      mood: 'eerie, tense, claustrophobic',
    })).toBe('Eerie Tense');
  });

  it('handles single-word mood', () => {
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM, mood: 'urgent',
    })).toBe('Urgent');
  });

  it('falls back to preset label when mood is empty', () => {
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM, presetKey: 'cave',
    })).toBe('Cave');
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM, presetKey: 'tension',
    })).toBe('Tension');
  });

  it('mood wins over preset', () => {
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM, presetKey: 'combat', mood: 'desperate',
    })).toBe('Desperate');
  });

  it('falls back to first 1-2 words of free prompt when no preset/mood', () => {
    expect(computeMusicDisplayName({
      prompt: 'dark ambient music for a dungeon', roomId: ROOM,
    })).toBe('Dark Ambient');
  });

  it('returns "AI Music" when nothing is provided', () => {
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM,
    })).toBe('AI Music');
  });

  it('caps result at 64 chars', () => {
    const longWord = 'a'.repeat(100);
    const out = computeMusicDisplayName({
      prompt: '', roomId: ROOM, mood: longWord,
    });
    expect(out.length).toBeLessThanOrEqual(64);
  });

  it('handles whitespace-only mood as missing', () => {
    expect(computeMusicDisplayName({
      prompt: '', roomId: ROOM, mood: '   \t  ', presetKey: 'tavern',
    })).toBe('Tavern');
  });
});

describe('AIService.generateMusic — auto-name + composedPrompt wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes composedPrompt as aiPrompt and derived displayName to storeAiAsset', async () => {
    const provider = {
      generateMusic: vi.fn().mockResolvedValue({
        bytes: Buffer.from([1, 2, 3]),
        mimeType: 'audio/mpeg',
        composedPrompt: 'Mood: eerie...\nInstrumentation: drones...',
      }),
    } as unknown as AIProvider;
    const assets = {
      storeAiAsset: vi.fn().mockResolvedValue({ id: 'asset-1' }),
    } as unknown as AssetService;

    const service = new AIService(provider, assets);
    const req: AIMusicRequest = {
      prompt: '', roomId: ROOM, presetKey: 'cave',
      mood: 'claustrophobic and dark',
    };
    await service.generateMusic('user-1', req);

    expect(assets.storeAiAsset).toHaveBeenCalledTimes(1);
    const call = (assets.storeAiAsset as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    // signature: userId, roomId, payload, kind, prompt, aiModel, opts?
    expect(call?.[4]).toBe('Mood: eerie...\nInstrumentation: drones...');
    expect(call?.[5]).toBe('lyria-3-clip-preview');
    expect(call?.[6]).toEqual({ displayName: 'Claustrophobic And' });
  });

  it('uses preset label as displayName when mood is empty', async () => {
    const provider = {
      generateMusic: vi.fn().mockResolvedValue({
        bytes: Buffer.from([1]), mimeType: 'audio/mpeg', composedPrompt: 'X',
      }),
    } as unknown as AIProvider;
    const assets = {
      storeAiAsset: vi.fn().mockResolvedValue({ id: 'a' }),
    } as unknown as AssetService;

    const service = new AIService(provider, assets);
    await service.generateMusic('user-1', {
      prompt: '', roomId: ROOM, presetKey: 'tension',
    });

    const call = (assets.storeAiAsset as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[6]).toEqual({ displayName: 'Tension' });
  });
});

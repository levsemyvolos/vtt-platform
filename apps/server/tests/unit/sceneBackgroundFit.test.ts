/**
 * Unit tests — Mini-A: Scene background-fit fields (Sess 4).
 *
 * Covers:
 * 1. sceneUpdateSchema accepts valid backgroundFit values.
 * 2. sceneUpdateSchema rejects invalid backgroundFit.
 * 3. sceneUpdateSchema rejects backgroundScale outside [0.05, 20].
 * 4. sceneUpdateSchema accepts negative backgroundOffsetX/Y (large negative allowed).
 * 5. projectScene maps the new DB fields to SceneDTO correctly.
 */
import { describe, it, expect } from 'vitest';
import { sceneUpdateSchema } from '../../src/schemas/scene.schema.js';
import { projectScene } from '../../src/services/projections.js';
import type { Scene, Token } from '@prisma/client';

// ─── sceneUpdateSchema validation ────────────────────────────────────────────

describe('sceneUpdateSchema — backgroundFit fields (Mini-A)', () => {
  it('accepts backgroundFit: cover', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundFit: 'cover' });
    expect(r.success).toBe(true);
  });

  it('accepts backgroundFit: contain', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundFit: 'contain' });
    expect(r.success).toBe(true);
  });

  it('accepts backgroundFit: stretch', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundFit: 'stretch' });
    expect(r.success).toBe(true);
  });

  it('rejects backgroundFit: invalid value → parse error', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundFit: 'tile' });
    expect(r.success).toBe(false);
  });

  it('rejects backgroundScale below 0.05', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundScale: 0.01 });
    expect(r.success).toBe(false);
  });

  it('rejects backgroundScale above 20', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundScale: 21 });
    expect(r.success).toBe(false);
  });

  it('accepts backgroundScale at boundary 0.05', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundScale: 0.05 });
    expect(r.success).toBe(true);
  });

  it('accepts backgroundScale at boundary 20', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundScale: 20 });
    expect(r.success).toBe(true);
  });

  it('accepts negative backgroundOffsetX (large)', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundOffsetX: -9999 });
    expect(r.success).toBe(true);
  });

  it('accepts negative backgroundOffsetY', () => {
    const r = sceneUpdateSchema.safeParse({ backgroundOffsetY: -500 });
    expect(r.success).toBe(true);
  });

  it('accepts all four fields together', () => {
    const r = sceneUpdateSchema.safeParse({
      backgroundFit: 'contain',
      backgroundOffsetX: -200,
      backgroundOffsetY: 100,
      backgroundScale: 1.5,
    });
    expect(r.success).toBe(true);
  });
});

// ─── projectScene projection ──────────────────────────────────────────────────

function makeScene(overrides: Partial<Scene> = {}): Scene & { tokens: Token[] } {
  return {
    id: 'scene-1',
    roomId: 'room-1',
    name: 'Test',
    backgroundAssetId: null,
    backgroundFit: 'cover',
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1.0,
    gridSize: 50,
    gridWidth: 40,
    gridHeight: 40,
    gridVisible: true,
    fogShapes: null,
    isHidden: false,
    isActive: false,
    currentRound: 1,
    annotations: null,
    createdAt: new Date(),
    tokens: [],
    ...overrides,
  } as Scene & { tokens: Token[] };
}

describe('projectScene — new background fields included in DTO (Mini-A)', () => {
  it('maps backgroundFit from scene', () => {
    const dto = projectScene(makeScene({ backgroundFit: 'contain' }), 'GM', 'u1');
    expect(dto.backgroundFit).toBe('contain');
  });

  it('maps backgroundOffsetX and backgroundOffsetY', () => {
    const dto = projectScene(makeScene({ backgroundOffsetX: -250, backgroundOffsetY: 75 }), 'GM', 'u1');
    expect(dto.backgroundOffsetX).toBe(-250);
    expect(dto.backgroundOffsetY).toBe(75);
  });

  it('maps backgroundScale', () => {
    const dto = projectScene(makeScene({ backgroundScale: 1.8 }), 'GM', 'u1');
    expect(dto.backgroundScale).toBe(1.8);
  });

  it('defaults backgroundFit to cover when DB value is null/undefined', () => {
    const scene = makeScene();
    // Simulate missing field (e.g. old row before migration completed)
    (scene as unknown as Record<string, unknown>)['backgroundFit'] = null;
    const dto = projectScene(scene, 'GM', 'u1');
    expect(dto.backgroundFit).toBe('cover');
  });
});

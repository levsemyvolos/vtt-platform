import { describe, it, expect } from 'vitest';
import { projectScene } from '../../src/services/projections.js';
import type { Scene, Token } from '@prisma/client';
import type { SceneAnnotations } from '@vtt/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(annotations: SceneAnnotations): Scene & { tokens: Token[] } {
  return {
    id: 'scene-1',
    roomId: 'room-1',
    name: 'Test Scene',
    gridSize: 50,
    gridWidth: 20,
    gridHeight: 20,
    gridVisible: true,
    isActive: true,
    isHidden: false,
    currentRound: 1,
    fogShapes: [] as unknown as Scene['fogShapes'],
    annotations: annotations as unknown as Scene['annotations'],
    backgroundAssetId: null,
    backgroundFit: 'cover',
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1,
    createdAt: new Date(),
    tokens: [],
  };
}

function makeAnnotations(): SceneAnnotations {
  return {
    schemaVersion: 2,
    strokes: [
      { strokeId: 'stroke-visible', userId: 'u1', points: [0, 0], color: '#f00', width: 2, layer: 'overlay', visibility: 'all' },
      { strokeId: 'stroke-gm-only', userId: 'u1', points: [1, 1], color: '#0f0', width: 2, layer: 'overlay', visibility: 'gm-only' },
    ],
    texts: [
      { id: 'txt-visible', userId: 'u1', x: 0, y: 0, text: 'Public', fontSize: 16, color: '#fff', layer: 'overlay', visibility: 'all' },
      { id: 'txt-gm-only', userId: 'u1', x: 10, y: 10, text: 'Secret', fontSize: 16, color: '#fff', layer: 'overlay', visibility: 'gm-only' },
    ],
    images: [
      { id: 'img-visible', userId: 'u1', x: 0, y: 0, assetId: 'a1', width: 64, height: 64, layer: 'tile', visibility: 'all' },
      { id: 'img-gm-only', userId: 'u1', x: 10, y: 10, assetId: 'a2', width: 64, height: 64, layer: 'tile', visibility: 'gm-only' },
    ],
    objects: [
      { id: 'stroke-visible', type: 'stroke', userId: 'u1', x: 0, y: 0, zIndex: 0, points: [0, 0], color: '#f00', strokeWidth: 2, layer: 'overlay', visibility: 'all' },
      { id: 'stroke-gm-only', type: 'stroke', userId: 'u1', x: 1, y: 1, zIndex: 1, points: [1, 1], color: '#0f0', strokeWidth: 2, layer: 'overlay', visibility: 'gm-only' },
      { id: 'txt-visible', type: 'text', userId: 'u1', x: 0, y: 0, zIndex: 2, text: 'Public', fontSize: 16, color: '#fff', layer: 'overlay', visibility: 'all' },
      { id: 'txt-gm-only', type: 'text', userId: 'u1', x: 10, y: 10, zIndex: 3, text: 'Secret', fontSize: 16, color: '#fff', layer: 'overlay', visibility: 'gm-only' },
      { id: 'img-visible', type: 'image', userId: 'u1', x: 0, y: 0, zIndex: 4, assetId: 'a1', width: 64, height: 64, layer: 'tile', visibility: 'all' },
      { id: 'img-gm-only', type: 'image', userId: 'u1', x: 10, y: 10, zIndex: 5, assetId: 'a2', width: 64, height: 64, layer: 'tile', visibility: 'gm-only' },
    ],
  };
}

// ---------------------------------------------------------------------------
// GM viewer — sees everything
// ---------------------------------------------------------------------------

describe('projectScene — GM viewer', () => {
  it('includes all objects[] (including gm-only)', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'GM', 'gm-user');
    expect(dto.annotations.objects?.length).toBe(6);
  });

  it('includes gm-only objects in objects[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'GM', 'gm-user');
    const ids = (dto.annotations.objects ?? []).map((o) => o.id);
    expect(ids).toContain('stroke-gm-only');
    expect(ids).toContain('txt-gm-only');
    expect(ids).toContain('img-gm-only');
  });

  it('includes all images[] (including gm-only)', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'GM', 'gm-user');
    expect(dto.annotations.images.length).toBe(2);
  });

  it('includes all texts[] (including gm-only)', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'GM', 'gm-user');
    expect(dto.annotations.texts.length).toBe(2);
  });

  it('includes all strokes[] (including gm-only)', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'GM', 'gm-user');
    expect(dto.annotations.strokes.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Player viewer — gm-only objects filtered
// ---------------------------------------------------------------------------

describe('projectScene — Player viewer', () => {
  it('filters gm-only from objects[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Player', 'player-user');
    const ids = (dto.annotations.objects ?? []).map((o) => o.id);
    expect(ids).not.toContain('stroke-gm-only');
    expect(ids).not.toContain('txt-gm-only');
    expect(ids).not.toContain('img-gm-only');
  });

  it('keeps visible objects in objects[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Player', 'player-user');
    const ids = (dto.annotations.objects ?? []).map((o) => o.id);
    expect(ids).toContain('stroke-visible');
    expect(ids).toContain('txt-visible');
    expect(ids).toContain('img-visible');
  });

  it('filters gm-only from images[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Player', 'player-user');
    const ids = dto.annotations.images.map((i) => i.id);
    expect(ids).not.toContain('img-gm-only');
    expect(ids).toContain('img-visible');
  });

  it('filters gm-only from texts[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Player', 'player-user');
    const ids = dto.annotations.texts.map((t) => t.id);
    expect(ids).not.toContain('txt-gm-only');
    expect(ids).toContain('txt-visible');
  });

  it('filters gm-only from strokes[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Player', 'player-user');
    const ids = dto.annotations.strokes.map((s) => s.strokeId);
    expect(ids).not.toContain('stroke-gm-only');
    expect(ids).toContain('stroke-visible');
  });

  it('objects[] has 3 visible entries', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Player', 'player-user');
    expect(dto.annotations.objects?.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Observer viewer — same filtering as Player
// ---------------------------------------------------------------------------

describe('projectScene — Observer viewer', () => {
  it('filters gm-only from objects[]', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Observer', 'obs-user');
    const ids = (dto.annotations.objects ?? []).map((o) => o.id);
    expect(ids).not.toContain('img-gm-only');
    expect(ids).not.toContain('txt-gm-only');
    expect(ids).not.toContain('stroke-gm-only');
  });

  it('filters gm-only from all legacy arrays', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Observer', 'obs-user');
    expect(dto.annotations.images.map((i) => i.id)).not.toContain('img-gm-only');
    expect(dto.annotations.texts.map((t) => t.id)).not.toContain('txt-gm-only');
    expect(dto.annotations.strokes.map((s) => s.strokeId)).not.toContain('stroke-gm-only');
  });

  it('objects[] has 3 visible entries', () => {
    const scene = makeScene(makeAnnotations());
    const dto = projectScene(scene, 'Observer', 'obs-user');
    expect(dto.annotations.objects?.length).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneAnnotationService } from '../../src/services/SceneAnnotationService.js';
import type { SceneAnnotations } from '@vtt/shared';

const SCENE_ID = 'scene-1';
const ROOM_ID = 'room-1';
const USER_ID = 'user-1';

function makeEmptyAnnotations(): SceneAnnotations {
  return { strokes: [], texts: [], images: [] };
}

function makeDrawService(initial: SceneAnnotations = makeEmptyAnnotations()) {
  const data = { ...initial, strokes: [...initial.strokes], texts: [...initial.texts], images: [...initial.images] };
  return {
    getAnnotations: vi.fn().mockResolvedValue(data),
    persist: vi.fn().mockResolvedValue(undefined),
    _data: data,
  };
}

function makePrisma(roomId = ROOM_ID) {
  return {
    scene: {
      findUnique: vi.fn().mockResolvedValue({ id: SCENE_ID, roomId, tokens: [] }),
    },
  };
}

describe('SceneAnnotationService.addText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends a TextAnnotation and broadcasts scene:updated', async () => {
    const drawSvc = makeDrawService();
    const broadcast = vi.fn();
    const prisma = makePrisma();
    const svc = new SceneAnnotationService(prisma as never, drawSvc as never, broadcast);

    const result = await svc.addText(SCENE_ID, USER_ID, { x: 10, y: 20, text: 'Hello' });

    expect(drawSvc.persist).toHaveBeenCalledOnce();
    expect(result.texts).toHaveLength(1);
    expect(result.texts[0].text).toBe('Hello');
    expect(result.texts[0].userId).toBe(USER_ID);
    expect(broadcast).toHaveBeenCalledWith(ROOM_ID, expect.objectContaining({ sceneId: SCENE_ID }));
  });
});

describe('SceneAnnotationService.addImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends an ImageAnnotation and broadcasts scene:updated', async () => {
    const drawSvc = makeDrawService();
    const broadcast = vi.fn();
    const prisma = makePrisma();
    const svc = new SceneAnnotationService(prisma as never, drawSvc as never, broadcast);

    const result = await svc.addImage(SCENE_ID, USER_ID, { x: 0, y: 0, assetId: 'asset-xyz' });

    expect(drawSvc.persist).toHaveBeenCalledOnce();
    expect(result.images).toHaveLength(1);
    expect(result.images[0].assetId).toBe('asset-xyz');
    expect(result.images[0].width).toBe(128);
    expect(broadcast).toHaveBeenCalledOnce();
  });
});

describe('SceneAnnotationService.removeAnnotation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GM can remove any annotation', async () => {
    const text = { id: 'ann-1', userId: 'other-user', x: 0, y: 0, text: 'Hi', fontSize: 16, color: '#fff' };
    const drawSvc = makeDrawService({ strokes: [], texts: [text], images: [] });
    const broadcast = vi.fn();
    const prisma = makePrisma();
    const svc = new SceneAnnotationService(prisma as never, drawSvc as never, broadcast);

    await svc.removeAnnotation(SCENE_ID, 'ann-1', USER_ID, 'GM');

    expect(drawSvc.persist).toHaveBeenCalledOnce();
    const persisted = (drawSvc.persist.mock.calls[0][1] as SceneAnnotations);
    expect(persisted.texts).toHaveLength(0);
  });

  it('throws 404 when annotation not found', async () => {
    const drawSvc = makeDrawService();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never, vi.fn());

    await expect(svc.removeAnnotation(SCENE_ID, 'nonexistent', USER_ID, 'GM')).rejects.toMatchObject({ status: 404 });
  });
});

describe('SceneAnnotationService.moveAnnotation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves an image annotation in legacy arrays and scene objects', async () => {
    const image = { id: 'img-1', userId: USER_ID, x: 10, y: 20, assetId: 'asset-1', width: 128, height: 128 };
    const drawSvc = makeDrawService({ strokes: [], texts: [], images: [image] });
    const broadcast = vi.fn();
    const svc = new SceneAnnotationService(makePrisma() as never, drawSvc as never, broadcast);

    const result = await svc.moveAnnotation(SCENE_ID, 'img-1', USER_ID, 'Player', { x: 42, y: 84 });

    expect(drawSvc.persist).toHaveBeenCalledOnce();
    expect(result.images[0]).toMatchObject({ x: 42, y: 84 });
    expect(result.objects?.[0]).toMatchObject({ id: 'img-1', type: 'image', x: 42, y: 84 });
    expect(broadcast).toHaveBeenCalledWith(ROOM_ID, expect.objectContaining({ annotations: result }));
  });
});

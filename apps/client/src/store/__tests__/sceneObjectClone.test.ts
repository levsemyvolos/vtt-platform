import { describe, it, expect } from 'vitest';
import type { ImageSceneObject, TextSceneObject, StrokeSceneObject } from '@vtt/shared';
import { buildClonedObject } from '../sceneObjectClone';

const USER_ID = 'user-gm';

function makeImage(overrides: Partial<ImageSceneObject> = {}): ImageSceneObject {
  return {
    id: 'img-1',
    type: 'image',
    userId: 'old-user',
    x: 100,
    y: 200,
    zIndex: 5,
    assetId: 'asset-abc',
    width: 300,
    height: 150,
    layer: 'tile',
    visibility: 'all',
    ...overrides,
  };
}

function makeText(overrides: Partial<TextSceneObject> = {}): TextSceneObject {
  return {
    id: 'text-1',
    type: 'text',
    userId: 'old-user',
    x: 50,
    y: 60,
    zIndex: 2,
    text: 'Hello World',
    fontSize: 18,
    color: '#ff0000',
    layer: 'overlay',
    visibility: 'all',
    ...overrides,
  };
}

function makeStroke(overrides: Partial<StrokeSceneObject> = {}): StrokeSceneObject {
  return {
    id: 'stroke-1',
    type: 'stroke',
    userId: 'old-user',
    x: 0,
    y: 0,
    zIndex: 1,
    points: [10, 20, 30, 40],
    color: '#00ff00',
    strokeWidth: 3,
    layer: 'overlay',
    visibility: 'all',
    ...overrides,
  };
}

describe('buildClonedObject — image', () => {
  it('assigns a new id different from the source id', () => {
    const source = makeImage();
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.id).not.toBe(source.id);
    expect(clone.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('offsets x and y by +20', () => {
    const source = makeImage();
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.x).toBe(source.x + 20);
    expect(clone.y).toBe(source.y + 20);
  });

  it('sets zIndex to max(allObjects zIndex) + 1', () => {
    const source = makeImage({ zIndex: 5 });
    const peer = makeText({ id: 'peer', zIndex: 9 });
    const clone = buildClonedObject(source, [source, peer], USER_ID);
    expect(clone.zIndex).toBe(10);
  });

  it('sets zIndex to 0 when allObjects is empty', () => {
    const source = makeImage();
    const clone = buildClonedObject(source, [], USER_ID);
    expect(clone.zIndex).toBe(0);
  });

  it('preserves type as "image"', () => {
    const source = makeImage();
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.type).toBe('image');
  });

  it('preserves assetId, width and height', () => {
    const source = makeImage({ assetId: 'my-asset', width: 400, height: 200 });
    const clone = buildClonedObject(source, [source], USER_ID);
    if (clone.type !== 'image') throw new Error('Expected image');
    expect(clone.assetId).toBe('my-asset');
    expect(clone.width).toBe(400);
    expect(clone.height).toBe(200);
  });

  it('assigns the provided userId to the clone', () => {
    const source = makeImage();
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.userId).toBe(USER_ID);
  });

  it('does not mutate the source object', () => {
    const source = makeImage();
    const origX = source.x;
    buildClonedObject(source, [source], USER_ID);
    expect(source.x).toBe(origX);
    expect(source.id).toBe('img-1');
  });
});

describe('buildClonedObject — text', () => {
  it('assigns a new id', () => {
    const source = makeText();
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.id).not.toBe(source.id);
  });

  it('preserves text, fontSize, color', () => {
    const source = makeText({ text: 'Test Label', fontSize: 24, color: '#abcdef' });
    const clone = buildClonedObject(source, [source], USER_ID);
    if (clone.type !== 'text') throw new Error('Expected text');
    expect(clone.text).toBe('Test Label');
    expect(clone.fontSize).toBe(24);
    expect(clone.color).toBe('#abcdef');
  });

  it('offsets x and y by +20', () => {
    const source = makeText({ x: 80, y: 90 });
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.x).toBe(100);
    expect(clone.y).toBe(110);
  });
});

describe('buildClonedObject — stroke', () => {
  it('assigns a new id', () => {
    const source = makeStroke();
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.id).not.toBe(source.id);
  });

  it('preserves points, color, strokeWidth', () => {
    const source = makeStroke({ points: [1, 2, 3, 4], color: '#ff00ff', strokeWidth: 5 });
    const clone = buildClonedObject(source, [source], USER_ID);
    if (clone.type !== 'stroke') throw new Error('Expected stroke');
    expect(clone.points).toEqual([1, 2, 3, 4]);
    expect(clone.color).toBe('#ff00ff');
    expect(clone.strokeWidth).toBe(5);
  });

  it('sets zIndex to top of stack', () => {
    const source = makeStroke({ zIndex: 0 });
    const peer = makeImage({ id: 'img-peer', zIndex: 3 });
    const clone = buildClonedObject(source, [source, peer], USER_ID);
    expect(clone.zIndex).toBe(4);
  });
});

describe('buildClonedObject — layer and visibility preservation', () => {
  it('image: preserves layer=overlay and visibility=gm-only from source', () => {
    const source = makeImage({ layer: 'overlay', visibility: 'gm-only' });
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.layer).toBe('overlay');
    expect(clone.visibility).toBe('gm-only');
  });

  it('image: preserves layer=tile and visibility=all from source', () => {
    const source = makeImage({ layer: 'tile', visibility: 'all' });
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.layer).toBe('tile');
    expect(clone.visibility).toBe('all');
  });

  it('text: preserves layer=tile from source', () => {
    const source = makeText({ layer: 'tile', visibility: 'all' });
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.layer).toBe('tile');
    expect(clone.visibility).toBe('all');
  });

  it('text: preserves layer=overlay and visibility=gm-only from source', () => {
    const source = makeText({ layer: 'overlay', visibility: 'gm-only' });
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.layer).toBe('overlay');
    expect(clone.visibility).toBe('gm-only');
  });
});

describe('buildClonedObject — zIndex edge cases', () => {
  it('with a single object in allObjects (itself), zIndex = its own zIndex + 1', () => {
    const source = makeImage({ zIndex: 7 });
    const clone = buildClonedObject(source, [source], USER_ID);
    expect(clone.zIndex).toBe(8);
  });

  it('with multiple objects, picks the global max', () => {
    const a = makeImage({ id: 'a', zIndex: 1 });
    const b = makeText({ id: 'b', zIndex: 15 });
    const c = makeStroke({ id: 'c', zIndex: 3 });
    const clone = buildClonedObject(a, [a, b, c], USER_ID);
    expect(clone.zIndex).toBe(16);
  });
});

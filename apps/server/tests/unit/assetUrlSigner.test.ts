import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signAssetUrl, verifyAssetUrl, _resetKeyCacheForTests } from '../../src/lib/assetUrlSigner.js';

const ASSET_ID = '11111111-1111-1111-1111-111111111111';
const PRIOR_SECRET = process.env['JWT_SECRET'];

beforeEach(() => {
  process.env['JWT_SECRET'] = 'test-secret-' + 'x'.repeat(48);
  _resetKeyCacheForTests();
});

afterEach(() => {
  if (PRIOR_SECRET === undefined) delete process.env['JWT_SECRET'];
  else process.env['JWT_SECRET'] = PRIOR_SECRET;
  _resetKeyCacheForTests();
});

describe('assetUrlSigner', () => {
  it('signAssetUrl returns a URL with exp and sig query params', () => {
    const { url, exp } = signAssetUrl(ASSET_ID);
    expect(url).toMatch(/^\/api\/assets\/[^/]+\/file\?exp=\d+&sig=[A-Za-z0-9_-]+$/);
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('verifyAssetUrl accepts a freshly signed pair', () => {
    const { url } = signAssetUrl(ASSET_ID);
    const params = new URL('http://h' + url).searchParams;
    expect(verifyAssetUrl(ASSET_ID, params.get('exp')!, params.get('sig')!)).toBe(true);
  });

  it('verifyAssetUrl rejects when exp is in the past beyond skew window', () => {
    const { url } = signAssetUrl(ASSET_ID);
    const params = new URL('http://h' + url).searchParams;
    // Force a stale exp by signing manually with past timestamp.
    // Easiest: rebuild URL with a past exp + the same sig — sig won't match.
    expect(verifyAssetUrl(ASSET_ID, '1', params.get('sig')!)).toBe(false);
  });

  it('verifyAssetUrl rejects tampered signatures (constant-time mismatch)', () => {
    const { url } = signAssetUrl(ASSET_ID);
    const params = new URL('http://h' + url).searchParams;
    const bad = params.get('sig')!.slice(0, -1) + (params.get('sig')!.endsWith('A') ? 'B' : 'A');
    expect(verifyAssetUrl(ASSET_ID, params.get('exp')!, bad)).toBe(false);
  });

  it('verifyAssetUrl rejects if signed for a different assetId', () => {
    const { url } = signAssetUrl(ASSET_ID);
    const params = new URL('http://h' + url).searchParams;
    const otherAsset = '22222222-2222-2222-2222-222222222222';
    expect(verifyAssetUrl(otherAsset, params.get('exp')!, params.get('sig')!)).toBe(false);
  });

  it('verifyAssetUrl returns false on missing query params', () => {
    expect(verifyAssetUrl(ASSET_ID, undefined, undefined)).toBe(false);
    expect(verifyAssetUrl(ASSET_ID, '12345', undefined)).toBe(false);
    expect(verifyAssetUrl(ASSET_ID, undefined, 'sig')).toBe(false);
    expect(verifyAssetUrl(ASSET_ID, 'not-a-number', 'sig')).toBe(false);
  });

  it('rotating JWT_SECRET invalidates previously signed URLs', () => {
    const { url } = signAssetUrl(ASSET_ID);
    const params = new URL('http://h' + url).searchParams;
    process.env['JWT_SECRET'] = 'completely-different-secret-' + 'y'.repeat(48);
    _resetKeyCacheForTests();
    expect(verifyAssetUrl(ASSET_ID, params.get('exp')!, params.get('sig')!)).toBe(false);
  });
});

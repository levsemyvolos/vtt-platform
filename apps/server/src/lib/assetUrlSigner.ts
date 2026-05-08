import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Capability-based URL signer for /api/assets/:id/file.
 *
 * Why this exists: <img> and new Image() can't send Authorization headers,
 * so JWT-gated GETs fail. Instead we issue short-lived HMAC-signed URLs
 * that browsers can fetch without any header. Bucket stays private — only
 * the signed URL grants read access, and only to a single asset for a
 * bounded TTL.
 *
 * Key derivation: HKDF(JWT_SECRET, info="asset-url-v1") so rotating
 * JWT_SECRET also rotates URL signatures. The "v1" lets us migrate to a
 * different scheme later without breaking outstanding URLs.
 *
 * Canonical signed string: `v1.${assetId}.${expUnix}` — the version byte
 * lets verifiers short-circuit on mismatch before doing the HMAC compare.
 */

const VERSION = 'v1';
const TTL_SECONDS = 4 * 60 * 60; // 4 hours
const CLOCK_SKEW_SECONDS = 60;

function deriveKey(): Buffer {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET not set — cannot derive asset URL signing key');
  // HKDF-SHA256, 32-byte output, info domain-separates from JWT signing.
  const salt = Buffer.alloc(0);
  const okm = hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, Buffer.from('asset-url-v1', 'utf8'), 32);
  return Buffer.from(okm);
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = deriveKey();
  return cachedKey;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface SignedAssetUrl {
  /** Path portion: `/api/assets/:id/file?exp=...&sig=...` */
  url: string;
  /** Unix-seconds expiry — useful for client-side proactive refresh. */
  exp: number;
}

/** Sign an asset access URL valid for the default TTL. */
export function signAssetUrl(assetId: string): SignedAssetUrl {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = computeSig(assetId, exp);
  return { url: `/api/assets/${assetId}/file?exp=${exp}&sig=${sig}`, exp };
}

/**
 * Verify a signed URL. Returns true iff:
 *   - exp is in the future (with 60s skew tolerance)
 *   - HMAC matches the canonical string
 * Constant-time compare to prevent timing-leak of the signature.
 */
export function verifyAssetUrl(assetId: string, expRaw: string | undefined, sigRaw: string | undefined): boolean {
  if (!expRaw || !sigRaw) return false;
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (exp + CLOCK_SKEW_SECONDS < now) return false;
  // Compare base64url strings directly — decoding first discards the last
  // 2 padding bits, making 'A' and 'B' indistinguishable at the end of a
  // 43-char SHA-256 digest and opening a 1-bit forgery window.
  const expectedBuf = Buffer.from(computeSig(assetId, exp), 'utf8');
  const providedBuf = Buffer.from(sigRaw, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

function computeSig(assetId: string, exp: number): string {
  const canonical = `${VERSION}.${assetId}.${exp}`;
  const mac = createHmac('sha256', getKey()).update(canonical).digest();
  return base64url(mac);
}

/** For tests only — clears the derived-key cache so a new JWT_SECRET takes effect. */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
}

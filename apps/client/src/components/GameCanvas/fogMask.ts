/**
 * Fog-of-War mask packing helpers (algorithm A4, §2.17.5 — client side).
 *
 * Wire format mirrors the server's `Scene.fogMaskBase64`: a base64-encoded
 * packed bitmap, MSB-first, traversed in column-major order
 * (`idx = x * height + y`). Bit value `1` = hidden cell, `0` = revealed.
 *
 * The full snapshot arrives via `SceneDTO.fogMaskBase64`; live updates arrive
 * via `FogMaskDiffPayload.diffBase64` and are applied with bitwise XOR.
 */

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Tests whether the cell `(x,y)` is hidden in a packed mask.
 * Returns `false` when the mask is null/empty (treat as fully revealed).
 */
export function isCellHidden(
  maskBase64: string | null,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (!maskBase64 || width <= 0 || height <= 0) return false;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const idx = x * height + y;
  const byte = idx >> 3;
  const bit = 7 - (idx & 7);
  const bytes = base64ToBytes(maskBase64);
  if (byte >= bytes.length) return false;
  return ((bytes[byte]! >> bit) & 1) === 1;
}

/**
 * XORs two packed masks of (potentially) different lengths and returns the
 * packed result. The shorter buffer is treated as zero-padded on the right.
 */
export function xorPackedMasks(
  baseBase64: string | null,
  diffBase64: string,
): string {
  const base = baseBase64 ? base64ToBytes(baseBase64) : new Uint8Array(0);
  const diff = base64ToBytes(diffBase64);
  const len = Math.max(base.length, diff.length);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = (base[i] ?? 0) ^ (diff[i] ?? 0);
  }
  return bytesToBase64(out);
}

/** Returns a v4 UUID using the Web Crypto API (available in all modern browsers). */
export function randomUUID(): string {
  return crypto.randomUUID();
}

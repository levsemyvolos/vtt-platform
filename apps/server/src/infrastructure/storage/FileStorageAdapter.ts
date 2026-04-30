/**
 * Provider-neutral object-storage abstraction (§2.13.3, §2.16).
 * Concrete implementation: GcsFileStorageAdapter over @google-cloud/storage.
 *
 * Invariant (НФВ 4.5): no `storageKey` is ever transported to the client.
 * Clients always receive a short-lived presigned URL with TTL = 15 min.
 */
export interface PutObjectInput {
  storageKey: string;
  bytes: Buffer;
  mimeType: string;
}

export interface FileStorageAdapter {
  /** Uploads bytes; returns the canonical storage key persisted in Asset. */
  put(input: PutObjectInput): Promise<string>;

  /** Returns a presigned URL (TTL = 15 min) for the given storage key. */
  getPresignedUrl(storageKey: string): Promise<string>;

  /** Deletes the object; idempotent (no error if already absent). */
  delete(storageKey: string): Promise<void>;
}

export const PRESIGNED_URL_TTL_MS = 15 * 60 * 1000;

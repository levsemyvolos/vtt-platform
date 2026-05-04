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

export interface PresignedUploadInput {
  storageKey: string;
  mimeType: string;
}

export interface PresignedUploadResult {
  /** PUT URL the client uses to upload bytes directly to GCS (TTL = 15 min). */
  uploadUrl: string;
  /** Wall-clock expiry. */
  expiresAt: Date;
}

export interface ObjectMetadata {
  /** Size in bytes once the upload has been finalized. */
  size: number;
  contentType: string;
}

export interface FileStorageAdapter {
  /** Uploads bytes; returns the canonical storage key persisted in Asset. */
  put(input: PutObjectInput): Promise<string>;

  /** Returns a presigned URL (TTL = 15 min) for the given storage key. */
  getPresignedUrl(storageKey: string): Promise<string>;

  /**
   * Returns a presigned PUT URL (TTL = 15 min) the client uses to upload
   * binary directly to the bucket (Чат 7.2 — audio upload, Ф6).
   *
   * The signed URL pins `Content-Type` to `mimeType`: any PUT with a different
   * MIME is rejected by GCS, which preserves the same MIME-allowlist invariant
   * as the server-side `put()` path.
   */
  getPresignedUploadUrl(input: PresignedUploadInput): Promise<PresignedUploadResult>;

  /**
   * Reads the object's metadata after a presigned upload to verify size /
   * MIME against the values declared on init. Returns null if the object
   * does not exist (client never finalized the PUT).
   */
  statObject(storageKey: string): Promise<ObjectMetadata | null>;

  /** Deletes the object; idempotent (no error if already absent). */
  delete(storageKey: string): Promise<void>;

  /**
   * Returns a readable stream for the object (§2.13.3).
   * Used for asset proxying to bypass CORS/403.
   */
  createReadStream(storageKey: string): NodeJS.ReadableStream;
}

export const PRESIGNED_URL_TTL_MS = 15 * 60 * 1000;

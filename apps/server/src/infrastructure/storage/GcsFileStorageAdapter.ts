import { Storage, type Bucket } from '@google-cloud/storage';
import {
  FileStorageAdapter,
  PRESIGNED_URL_TTL_MS,
  type PutObjectInput,
} from './FileStorageAdapter.js';

/**
 * Google Cloud Storage adapter (§2.13.3, §2.16).
 * Reuses the same OAuth 2.0 service account as Vertex AI (§2.11.4).
 */
export interface GcsFileStorageConfig {
  projectId: string;
  bucketName: string;
  serviceAccountKeyJson: string;
}

export class GcsFileStorageAdapter implements FileStorageAdapter {
  private readonly bucket: Bucket;

  constructor(cfg: GcsFileStorageConfig, storage?: Storage) {
    const credentials = JSON.parse(
      Buffer.from(cfg.serviceAccountKeyJson, 'base64').toString('utf-8'),
    ) as { client_email: string; private_key: string };
    const client = storage ?? new Storage({ projectId: cfg.projectId, credentials });
    this.bucket = client.bucket(cfg.bucketName);
  }

  async put({ storageKey, bytes, mimeType }: PutObjectInput): Promise<string> {
    await this.bucket.file(storageKey).save(bytes, {
      contentType: mimeType,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0, no-transform' },
    });
    return storageKey;
  }

  async getPresignedUrl(storageKey: string): Promise<string> {
    const [url] = await this.bucket.file(storageKey).getSignedUrl({
      action: 'read',
      version: 'v4',
      expires: Date.now() + PRESIGNED_URL_TTL_MS,
    });
    return url;
  }

  async delete(storageKey: string): Promise<void> {
    await this.bucket.file(storageKey).delete({ ignoreNotFound: true });
  }
}

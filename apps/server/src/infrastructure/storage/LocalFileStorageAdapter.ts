import { createReadStream } from 'fs';
import { mkdir, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import express, { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type {
  FileStorageAdapter,
  ObjectMetadata,
  PresignedUploadInput,
  PresignedUploadResult,
  PutObjectInput,
} from './FileStorageAdapter.js';
import { PRESIGNED_URL_TTL_MS } from './FileStorageAdapter.js';

function encodeKey(storageKey: string): string {
  return Buffer.from(storageKey, 'utf8').toString('base64url');
}

function decodeKey(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

export class LocalFileStorageAdapter implements FileStorageAdapter {
  constructor(
    private readonly rootDir: string,
    private readonly publicBasePath = '/api/storage/local',
  ) {}

  buildRouter(): IRouter {
    const router = Router();

    router.put(
      '/upload/:key',
      express.raw({ type: '*/*', limit: '100mb' }),
      async (req: Request<{ key: string }>, res: Response) => {
        const storageKey = decodeKey(req.params.key);
        const mimeType = String(req.query['mime'] ?? req.headers['content-type'] ?? 'application/octet-stream');
        await this.put({ storageKey, bytes: req.body as Buffer, mimeType });
        res.status(204).send();
      },
    );

    router.get('/object/:key', async (req: Request<{ key: string }>, res: Response) => {
      const storageKey = decodeKey(req.params.key);
      const filePath = this.pathFor(storageKey);
      const meta = await this.statObject(storageKey);
      if (!meta) {
        res.status(404).json({ error: { code: 404, message: 'Object not found' } });
        return;
      }
      res.setHeader('Content-Type', meta.contentType);
      createReadStream(filePath).pipe(res);
    });

    return router;
  }

  async put(input: PutObjectInput): Promise<string> {
    const filePath = this.pathFor(input.storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.bytes);
    await writeFile(`${filePath}.mime`, input.mimeType, 'utf8');
    return input.storageKey;
  }

  async getPresignedUrl(storageKey: string): Promise<string> {
    return `${this.publicBasePath}/object/${encodeKey(storageKey)}`;
  }

  async getPresignedUploadUrl(input: PresignedUploadInput): Promise<PresignedUploadResult> {
    const uploadUrl = `${this.publicBasePath}/upload/${encodeKey(input.storageKey)}?mime=${encodeURIComponent(input.mimeType)}`;
    return {
      uploadUrl,
      expiresAt: new Date(Date.now() + PRESIGNED_URL_TTL_MS),
    };
  }

  async statObject(storageKey: string): Promise<ObjectMetadata | null> {
    try {
      const filePath = this.pathFor(storageKey);
      const [fileStat, mimeType] = await Promise.all([
        stat(filePath),
        this.readMime(filePath),
      ]);
      return { size: fileStat.size, contentType: mimeType };
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.pathFor(storageKey);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(`${filePath}.mime`, { force: true }),
    ]);
  }

  createReadStream(storageKey: string): NodeJS.ReadableStream {
    return createReadStream(this.pathFor(storageKey));
  }

  private pathFor(storageKey: string): string {
    const normalized = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
    return path.join(this.rootDir, normalized);
  }

  private async readMime(filePath: string): Promise<string> {
    try {
      const { readFile } = await import('fs/promises');
      return (await readFile(`${filePath}.mime`, 'utf8')).trim() || 'application/octet-stream';
    } catch {
      return 'application/octet-stream';
    }
  }
}

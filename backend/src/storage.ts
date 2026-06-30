import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from './config.js';

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
}

/** In-memory storage used for tests and local runs without S3 configured. */
export class MemoryStorage implements Storage {
  private objects = new Map<string, StoredObject>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }
}

/** S3-backed storage. Works with real S3 or an S3-compatible endpoint (MinIO). */
export class S3Storage implements Storage {
  private client: S3Client;
  private bucket: string;

  constructor(cfg: Config['s3']) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint ?? undefined,
      forcePathStyle: cfg.forcePathStyle,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = Buffer.from(await res.Body!.transformToByteArray());
      return { body, contentType: res.ContentType ?? 'application/octet-stream' };
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }
}

export function createStorage(cfg: Config): Storage {
  return cfg.storageDriver === 's3' ? new S3Storage(cfg.s3) : new MemoryStorage();
}

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { S3Client } from '@aws-sdk/client-s3';

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageObject {
  contentType: string;
  sizeBytes: number;
}

export interface StorageService {
  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  headObject(key: string): Promise<StorageObject | undefined>;
  readPrefix(key: string, length: number): Promise<Uint8Array | undefined>;
}

export class S3StorageService implements StorageService {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async headObject(key: string): Promise<StorageObject | undefined> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      if (object.ContentType === undefined || object.ContentLength === undefined) {
        return undefined;
      }

      return { contentType: object.ContentType, sizeBytes: object.ContentLength };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata &&
        error.$metadata.httpStatusCode === 404
      ) {
        return undefined;
      }

      throw error;
    }
  }

  async readPrefix(key: string, length: number): Promise<Uint8Array | undefined> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
      );
      if (!object.Body) return undefined;
      return object.Body.transformToByteArray();
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata &&
        error.$metadata.httpStatusCode === 404
      )
        return undefined;
      throw error;
    }
  }
}

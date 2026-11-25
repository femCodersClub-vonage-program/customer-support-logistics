import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { S3StorageService } from './storage.service.js';

function client(endpoint: string) {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test-secret' },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
}

describe('S3StorageService', () => {
  it('signs PUT and GET on the public host while reading through the internal client', async () => {
    const internal = client('http://storage.internal:8333');
    const send = vi
      .spyOn(internal, 'send')
      .mockResolvedValue({ ContentLength: 4, ContentType: 'image/jpeg' } as never);
    const storage = new S3StorageService(
      internal,
      'evidence',
      client('https://storage.example.com'),
    );
    const upload = new URL(await storage.createUploadUrl('test.jpg', 'image/jpeg', 4, 60));
    expect(upload.origin).toBe('https://storage.example.com');
    expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(new URL(await storage.createDownloadUrl('test.jpg', 60)).origin).toBe(upload.origin);
    await expect(storage.headObject('test.jpg')).resolves.toEqual({
      sizeBytes: 4,
      contentType: 'image/jpeg',
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('falls back to the internal endpoint for local signing', async () => {
    const storage = new S3StorageService(client('http://localhost:8333'), 'evidence');
    expect(new URL(await storage.createUploadUrl('test.jpg', 'image/jpeg', 4, 60)).origin).toBe(
      'http://localhost:8333',
    );
    expect(new URL(await storage.createDownloadUrl('test.jpg', 60)).origin).toBe(
      'http://localhost:8333',
    );
  });

  it('paginates object listing using the internal client', async () => {
    const internal = client('http://localhost:8333');
    const send = vi
      .spyOn(internal, 'send')
      .mockResolvedValueOnce({
        Contents: [{ Key: 'incidents/a' }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      } as never)
      .mockResolvedValueOnce({ Contents: [{ Key: 'incidents/b' }], IsTruncated: false } as never);
    const keys = [];
    for await (const key of new S3StorageService(internal, 'evidence').listKeys('incidents/'))
      keys.push(key);
    expect(keys).toEqual(['incidents/a', 'incidents/b']);
    expect(send.mock.calls[1]![0]).toBeInstanceOf(ListObjectsV2Command);
    expect(send.mock.calls[1]![0].input).toMatchObject({
      Prefix: 'incidents/',
      ContinuationToken: 'next',
    });
  });
});

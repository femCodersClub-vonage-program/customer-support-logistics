import { randomUUID } from 'node:crypto';

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const bucket = process.env.STORAGE_BUCKET ?? 'evidence';
const client = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:8333',
  region: 'us-east-1',
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'admin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'dev_only_seaweedfs_secret',
  },
});
const prefix = `verification/${randomUUID()}`;
const uploadKey = `${prefix}/upload`;
const finalKey = `${prefix}/final`;
try {
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: uploadKey,
      ContentType: 'image/jpeg',
      ContentLength: 4,
    }),
    { expiresIn: 60, signableHeaders: new Set(['content-length', 'content-type']) },
  );
  const headers = { 'content-type': 'image/jpeg' };
  const wrong = await fetch(url, { method: 'PUT', headers, body: new Uint8Array([1, 2, 3, 4, 5]) });
  console.log(`Oversized signed PUT: ${wrong.status}`);
  if (wrong.ok) throw new Error('Storage accepted a different length');
  const valid = await fetch(url, {
    method: 'PUT',
    headers,
    body: new Uint8Array([255, 216, 255, 224]),
  });
  console.log(`Correct signed PUT: ${valid.status}`);
  if (!valid.ok) throw new Error('Storage rejected the correct length');
  await client.send(
    new CopyObjectCommand({ Bucket: bucket, Key: finalKey, CopySource: `${bucket}/${uploadKey}` }),
  );
  const overwrite = await fetch(url, {
    method: 'PUT',
    headers,
    body: new Uint8Array([1, 2, 3, 4]),
  });
  if (!overwrite.ok) throw new Error('Could not exercise reuse of the signed URL');
  const final = await client.send(new GetObjectCommand({ Bucket: bucket, Key: finalKey }));
  const bytes = await final.Body.transformToByteArray();
  if (Buffer.from(bytes).toString('hex') !== 'ffd8ffe0') throw new Error('Final copy changed');
  console.log('Final copy remains unchanged after upload URL reuse');
} finally {
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: [{ Key: uploadKey }, { Key: finalKey }] },
    }),
  );
}

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const bucket = `csl-lifecycle-test-${randomUUID()}`;
const key = 'evidence-pending/test';
const client = new S3Client({
  endpoint: 'http://localhost:8333',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: 'admin', secretAccessKey: 'dev_only_seaweedfs_secret' },
});
let created = false;
try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  created = true;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'lifecycle check' }));
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'verify',
            Status: 'Enabled',
            Filter: { Prefix: 'evidence-pending/' },
            Expiration: { Date: new Date('2020-01-01T00:00:00Z') },
          },
        ],
      },
    }),
  );
  const result = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'seaweedfs-admin',
      'wget',
      '-qO-',
      '--post-data={"timeout_seconds":120}',
      'http://127.0.0.1:12535/api/plugin/job-types/s3_lifecycle/run',
    ],
    { encoding: 'utf8' },
  );
  console.log(`Lifecycle invocation: ${result}`);
  await new Promise((resolve) => setTimeout(resolve, 15000));
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error('The expired object is still present');
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    console.log('Expired test object was deleted');
  }
} finally {
  if (created) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
}

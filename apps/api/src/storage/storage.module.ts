import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { S3StorageService, STORAGE_SERVICE } from './storage.service.js';

import type { Env } from '../config/env.schema.js';

export const S3_CLIENT = Symbol('S3_CLIENT');
export const S3_SIGNING_CLIENT = Symbol('S3_SIGNING_CLIENT');

@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new S3Client({
          endpoint: config.get('STORAGE_ENDPOINT', { infer: true }),
          region: config.get('STORAGE_REGION', { infer: true }),
          forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE', { infer: true }),
          requestChecksumCalculation: 'WHEN_REQUIRED',
          credentials: {
            accessKeyId: config.get('STORAGE_ACCESS_KEY', { infer: true }),
            secretAccessKey: config.get('STORAGE_SECRET_KEY', { infer: true }),
          },
        }),
    },
    {
      provide: S3_SIGNING_CLIENT,
      inject: [S3_CLIENT, ConfigService],
      useFactory: (client: S3Client, config: ConfigService<Env, true>) => {
        const endpoint = config.get('STORAGE_PUBLIC_ENDPOINT', { infer: true });
        return endpoint
          ? new S3Client({
              endpoint,
              region: config.get('STORAGE_REGION', { infer: true }),
              forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE', { infer: true }),
              requestChecksumCalculation: 'WHEN_REQUIRED',
              credentials: {
                accessKeyId: config.get('STORAGE_ACCESS_KEY', { infer: true }),
                secretAccessKey: config.get('STORAGE_SECRET_KEY', { infer: true }),
              },
            })
          : client;
      },
    },
    {
      provide: STORAGE_SERVICE,
      inject: [S3_CLIENT, ConfigService, S3_SIGNING_CLIENT],
      useFactory: (client: S3Client, config: ConfigService<Env, true>, signingClient: S3Client) =>
        new S3StorageService(client, config.get('STORAGE_BUCKET', { infer: true }), signingClient),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}

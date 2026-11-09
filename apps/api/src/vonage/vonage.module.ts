import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isVonageEnabled } from '../config/env.schema.js';

import { DisabledVonageService } from './disabled-vonage.service.js';
import { SdkVonageService } from './sdk-vonage.service.js';
import { createVonageClient } from './vonage.client.js';
import { VONAGE_SERVICE } from './vonage.service.js';

import type { VonageClient, VonageCredentials } from './vonage.client.js';
import type { VonageService } from './vonage.service.js';
import type { Env } from '../config/env.schema.js';

export function createVonageService(
  config: ConfigService<Env, true>,
  createClient: (credentials: VonageCredentials) => VonageClient = createVonageClient,
): VonageService {
  const enabled = isVonageEnabled({
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    VONAGE_ENABLED: config.get('VONAGE_ENABLED', { infer: true }),
  });

  if (!enabled) {
    return new DisabledVonageService();
  }

  const client = createClient({
    apiKey: config.getOrThrow('VONAGE_API_KEY', { infer: true }),
    apiSecret: config.getOrThrow('VONAGE_API_SECRET', { infer: true }),
    applicationId: config.getOrThrow('VONAGE_APPLICATION_ID', { infer: true }),
    privateKey: config.getOrThrow('VONAGE_PRIVATE_KEY', { infer: true }),
  });

  return new SdkVonageService(client, config.getOrThrow('VONAGE_VIRTUAL_NUMBER', { infer: true }));
}

@Module({
  providers: [
    {
      provide: VONAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => createVonageService(config),
    },
  ],
  exports: [VONAGE_SERVICE],
})
export class VonageModule {}

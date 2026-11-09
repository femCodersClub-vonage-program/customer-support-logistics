import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { VonageSignatureGuard } from './signature/vonage-signature.guard.js';

import type { Env } from '../config/env.schema.js';

export const WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        {
          ttl: WEBHOOK_RATE_LIMIT_WINDOW_MS,
          limit: config.get('WEBHOOK_RATE_LIMIT_PER_MINUTE', { infer: true }),
        },
      ],
    }),
  ],
  providers: [VonageSignatureGuard],
})
export class WebhooksModule {}

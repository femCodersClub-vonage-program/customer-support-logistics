import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { VonageModule } from '../vonage/vonage.module.js';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CustomerLoginService, SILENT_AUTH_REDIRECT_URL } from './customer-login.service.js';
import { PendingVerifications } from './pending-verifications.js';
import { SessionsService } from './sessions.service.js';

import type { Env } from '../config/env.schema.js';

@Module({
  imports: [VonageModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CustomerLoginService,
    PendingVerifications,
    SessionsService,
    {
      provide: SILENT_AUTH_REDIRECT_URL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('SILENT_AUTH_REDIRECT_URL', { infer: true }),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}

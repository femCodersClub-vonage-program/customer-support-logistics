import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { VonageModule } from '../vonage/vonage.module.js';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CustomerLoginService } from './customer-login.service.js';
import { PendingVerifications } from './pending-verifications.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [VonageModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CustomerLoginService,
    PendingVerifications,
    SessionsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}

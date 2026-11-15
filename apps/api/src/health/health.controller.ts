import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';

import { Public } from '../auth/auth.decorators.js';
import { DatabaseHealth } from '../database/database.health.js';
import { APP_VERSION } from '../version.js';

import type { HealthResponse, ReadinessResponse } from '@csl/shared-types';
import type { Response } from 'express';

@Controller('health')
@Public()
export class HealthController {
  constructor(@Inject(DatabaseHealth) private readonly database: DatabaseHealth) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok', version: APP_VERSION };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    if (await this.database.isUp()) {
      return { status: 'ok', database: 'up' };
    }

    response.status(HttpStatus.SERVICE_UNAVAILABLE);

    return { status: 'error', database: 'down' };
  }
}

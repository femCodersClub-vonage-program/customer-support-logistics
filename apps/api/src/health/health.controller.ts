import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseHealth } from '../database/database.health.js';
import { APP_VERSION } from '../version.js';

import type { HealthResponse, ReadinessResponse } from '@csl/shared-types';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseHealth) private readonly database: DatabaseHealth) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok', version: APP_VERSION };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    if (await this.database.isUp()) {
      return { status: 'ok', database: 'up' };
    }

    const body: ReadinessResponse = { status: 'error', database: 'down' };
    throw new ServiceUnavailableException(body);
  }
}

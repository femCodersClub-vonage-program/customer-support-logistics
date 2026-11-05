import { Controller, Get } from '@nestjs/common';

import { APP_VERSION } from '../version.js';

import type { HealthResponse } from '@csl/shared-types';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', version: APP_VERSION };
  }
}

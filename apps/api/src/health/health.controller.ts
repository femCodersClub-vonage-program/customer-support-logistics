import { Controller, Get } from '@nestjs/common';

import { APP_VERSION } from '../version.js';

export interface HealthResponse {
  status: 'ok';
  version: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', version: APP_VERSION };
  }
}

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { APP_VERSION } from '../version.js';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns ok status and the app version', () => {
    expect(controller.check()).toEqual({ status: 'ok', version: APP_VERSION });
  });
});

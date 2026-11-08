import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseHealth } from '../database/database.health.js';
import { APP_VERSION } from '../version.js';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const isUp = vi.fn<() => Promise<boolean>>();

  beforeEach(async () => {
    isUp.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DatabaseHealth, useValue: { isUp } }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns ok status and the app version', () => {
    expect(controller.check()).toEqual({ status: 'ok', version: APP_VERSION });
  });

  it('does not check the database for liveness', () => {
    controller.check();

    expect(isUp).not.toHaveBeenCalled();
  });

  it('reports ready when the database is up', async () => {
    isUp.mockResolvedValue(true);

    await expect(controller.ready()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('throws 503 with the database down', async () => {
    isUp.mockResolvedValue(false);

    const error = await controller.ready().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
      database: 'down',
    });
  });
});

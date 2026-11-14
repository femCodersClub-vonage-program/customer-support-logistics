import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseHealth } from '../database/database.health.js';
import { APP_VERSION } from '../version.js';

import { HealthController } from './health.controller.js';

import type { Response } from 'express';

const buildResponse = () => ({ status: vi.fn().mockReturnThis() });

const asResponse = (response: ReturnType<typeof buildResponse>) => response as unknown as Response;

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
    const response = buildResponse();

    await expect(controller.ready(asResponse(response))).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('responds 503 with the database down', async () => {
    isUp.mockResolvedValue(false);
    const response = buildResponse();

    await expect(controller.ready(asResponse(response))).resolves.toEqual({
      status: 'error',
      database: 'down',
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});

import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { validateEnv } from '../config/env.schema.js';

import { DevVerifyVonageService } from './dev-verify-vonage.service.js';
import { DisabledVonageService } from './disabled-vonage.service.js';
import { SdkVonageService } from './sdk-vonage.service.js';
import { createVonageService } from './vonage.module.js';

import type { VonageClient } from './vonage.client.js';
import type { Env } from '../config/env.schema.js';

const DATABASE_URL = 'postgresql://app:password@localhost:5432/customer_support_logistics';

const STORAGE_ENV = {
  STORAGE_ENDPOINT: 'http://localhost:8333',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'evidence',
  STORAGE_ACCESS_KEY: 'admin',
  STORAGE_SECRET_KEY: 'secret',
  STORAGE_FORCE_PATH_STYLE: 'true',
};

const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';

const VONAGE_ENV = {
  PUBLIC_URL: 'https://example.ngrok-free.app',
  VONAGE_API_KEY: 'key',
  VONAGE_API_SECRET: 'secret',
  VONAGE_APPLICATION_ID: 'app-id',
  VONAGE_PRIVATE_KEY: PRIVATE_KEY,
  VONAGE_VIRTUAL_NUMBER: '+34600000000',
  VONAGE_SIGNATURE_SECRET: 'signature',
};

function configFor(env: Record<string, string>) {
  return new ConfigService<Env, true>(validateEnv({ DATABASE_URL, ...STORAGE_ENV, ...env }));
}

describe('createVonageService', () => {
  it('uses the SDK with the configured credentials while Vonage is enabled', () => {
    const createClient = vi.fn(() => ({}) as VonageClient);

    const service = createVonageService(configFor(VONAGE_ENV), createClient);

    expect(service).toBeInstanceOf(SdkVonageService);
    expect(createClient).toHaveBeenCalledWith({
      apiKey: 'key',
      apiSecret: 'secret',
      applicationId: 'app-id',
      privateKey: PRIVATE_KEY,
    });
  });

  it('is disabled when VONAGE_ENABLED is false', () => {
    const createClient = vi.fn(() => ({}) as VonageClient);

    const service = createVonageService(configFor({ VONAGE_ENABLED: 'false' }), createClient);

    expect(service).toBeInstanceOf(DisabledVonageService);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('is disabled when NODE_ENV is test, even with credentials', () => {
    const createClient = vi.fn(() => ({}) as VonageClient);

    const service = createVonageService(
      configFor({ NODE_ENV: 'test', ...VONAGE_ENV }),
      createClient,
    );

    expect(service).toBeInstanceOf(DisabledVonageService);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('replaces Verify with the development code when DEV_VERIFY_CODE is set', () => {
    const createClient = vi.fn(() => ({}) as VonageClient);

    const service = createVonageService(
      configFor({ VONAGE_ENABLED: 'false', DEV_VERIFY_CODE: '123456' }),
      createClient,
    );

    expect(service).toBeInstanceOf(DevVerifyVonageService);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('DevVerifyVonageService', () => {
  it('accepts only the development code, without calling Vonage', async () => {
    const service = new DevVerifyVonageService('123456');
    const started = await service.startVerification();

    expect(started).toMatchObject({ status: 'started', requestId: expect.any(String) });
    await expect(service.checkVerification('any', '123456')).resolves.toEqual({
      status: 'verified',
    });
    await expect(service.checkVerification('any', '000000')).resolves.toEqual({
      status: 'wrong_code',
    });
  });

  it('still rejects SMS, calls and Client SDK tokens', async () => {
    const service = new DevVerifyVonageService('123456');

    await expect(service.sendSms()).rejects.toThrow(/"sendSms"/);
    await expect(service.createCall()).rejects.toThrow(/"createCall"/);
    await expect(service.transferCall()).rejects.toThrow(/"transferCall"/);
    await expect(service.hangupCall()).rejects.toThrow(/"hangupCall"/);
    await expect(service.ensureUser()).rejects.toThrow(/"ensureUser"/);
    await expect(service.createClientToken()).rejects.toThrow(/"createClientToken"/);
  });
});

describe('DisabledVonageService', () => {
  it('rejects every operation without calling Vonage', async () => {
    const service = new DisabledVonageService();

    await expect(service.sendSms()).rejects.toThrow(/Vonage is disabled, so "sendSms"/);
    await expect(service.createCall()).rejects.toThrow(/"createCall"/);
    await expect(service.transferCall()).rejects.toThrow(/"transferCall"/);
    await expect(service.hangupCall()).rejects.toThrow(/"hangupCall"/);
    await expect(service.startVerification()).rejects.toThrow(/"startVerification"/);
    await expect(service.checkVerification()).rejects.toThrow(/"checkVerification"/);
    await expect(service.ensureUser()).rejects.toThrow(/"ensureUser"/);
    await expect(service.createClientToken()).rejects.toThrow(/"createClientToken"/);
  });
});

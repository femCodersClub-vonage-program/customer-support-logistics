import { Logger, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  signVonageJwt,
  TEST_API_KEY,
  TEST_SIGNATURE_SECRET,
} from '../../../test/fixtures/vonage/sign.js';

import { VonageSignatureGuard } from './vonage-signature.guard.js';

import type { VonageSignedRequest } from './vonage-signature.guard.js';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const body = '{"status":"answered"}';

const contextFor = (request: Partial<VonageSignedRequest>) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

const guardWith = (env: Record<string, string | undefined>) =>
  new VonageSignatureGuard({ get: (key: string) => env[key] } as unknown as ConfigService<
    never,
    true
  >);

const requestWith = (authorization?: string): Partial<VonageSignedRequest> => ({
  method: 'POST',
  path: '/webhooks/voice/event',
  headers: authorization === undefined ? {} : { authorization },
  rawBody: Buffer.from(body),
});

const configured = { VONAGE_SIGNATURE_SECRET: TEST_SIGNATURE_SECRET, VONAGE_API_KEY: TEST_API_KEY };

describe('VonageSignatureGuard', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a correctly signed request through and attaches the claims', () => {
    const request = requestWith(`Bearer ${signVonageJwt({ body })}`);

    expect(guardWith(configured).canActivate(contextFor(request))).toBe(true);
    expect(request.vonageClaims).toMatchObject({ iss: 'Vonage', api_key: TEST_API_KEY });
  });

  it('rejects and logs a request without bearer token', () => {
    expect(() => guardWith(configured).canActivate(contextFor(requestWith()))).toThrow(
      UnauthorizedException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing bearer token'));
  });

  it('rejects and logs the reason for an invalid signature without logging the token', () => {
    const token = signVonageJwt({ body, secret: 'another-secret' });

    expect(() =>
      guardWith(configured).canActivate(contextFor(requestWith(`Bearer ${token}`))),
    ).toThrow('Invalid or missing Vonage signature');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad_signature'));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(token));
  });

  it('rejects a body that was changed after signing', () => {
    const request = {
      ...requestWith(`Bearer ${signVonageJwt({ body })}`),
      rawBody: Buffer.from('{}'),
    };

    expect(() => guardWith(configured).canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects every request when the signature secret is not configured', () => {
    const request = requestWith(`Bearer ${signVonageJwt({ body })}`);

    expect(() => guardWith({}).canActivate(contextFor(request))).toThrow(UnauthorizedException);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('VONAGE_SIGNATURE_SECRET'));
  });

  it('skips the API key check when no API key is configured', () => {
    const token = signVonageJwt({ body, claims: { api_key: 'other' } });
    const guard = guardWith({ VONAGE_SIGNATURE_SECRET: TEST_SIGNATURE_SECRET });

    expect(guard.canActivate(contextFor(requestWith(`Bearer ${token}`)))).toBe(true);
  });
});

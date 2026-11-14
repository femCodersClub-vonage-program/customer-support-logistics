import { describe, expect, it } from 'vitest';

import {
  signVonageJwt,
  TEST_API_KEY,
  TEST_SIGNATURE_SECRET,
} from '../../../test/fixtures/vonage/sign.js';

import { sha256Hex, verifyVonageJwt } from './vonage-jwt.js';

const now = new Date('2026-11-09T10:00:00Z');
const body = JSON.stringify({ message_uuid: 'abc', text: '1' });
const rawBody = Buffer.from(body);

const verify = (token: string, overrides: Partial<Parameters<typeof verifyVonageJwt>[0]> = {}) =>
  verifyVonageJwt({ token, secret: TEST_SIGNATURE_SECRET, rawBody, now, ...overrides });

describe('verifyVonageJwt', () => {
  it('accepts a token signed with the secret whose payload hash matches the body', () => {
    const result = verify(signVonageJwt({ body, now }), { apiKey: TEST_API_KEY });

    expect(result).toMatchObject({ valid: true, claims: { iss: 'Vonage', api_key: TEST_API_KEY } });
  });

  it('accepts a token without payload hash when there is no body', () => {
    expect(verify(signVonageJwt({ now }), { rawBody: undefined })).toMatchObject({ valid: true });
    expect(verify(signVonageJwt({ now }), { rawBody: Buffer.alloc(0) })).toMatchObject({
      valid: true,
    });
  });

  it('accepts an uppercase payload hash', () => {
    const token = signVonageJwt({
      now,
      claims: { payload_hash: sha256Hex(rawBody).toUpperCase() },
    });

    expect(verify(token)).toMatchObject({ valid: true });
  });

  it.each([
    ['not-a-jwt', 'malformed'],
    ['a.b', 'malformed'],
    ['a.b.c', 'malformed'],
  ])('rejects %s as %s', (token, reason) => {
    expect(verify(token)).toEqual({ valid: false, reason });
  });

  it('rejects a token without iat', () => {
    expect(verify(signVonageJwt({ body, now, claims: { iat: undefined } }))).toEqual({
      valid: false,
      reason: 'malformed',
    });
  });

  it('rejects algorithms other than HS256', () => {
    const token = signVonageJwt({ body, now, header: { alg: 'none', typ: 'JWT' } });

    expect(verify(token)).toEqual({ valid: false, reason: 'unsupported_algorithm' });
  });

  it('rejects a token signed with another secret', () => {
    expect(verify(signVonageJwt({ body, now, secret: 'another-secret' }))).toEqual({
      valid: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a token whose payload was changed after signing', () => {
    const [header, , signature] = signVonageJwt({ body, now }).split('.');
    const forged = Buffer.from(JSON.stringify({ iat: now.getTime() / 1000, iss: 'Vonage' }));

    expect(verify(`${header}.${forged.toString('base64url')}.${signature}`)).toEqual({
      valid: false,
      reason: 'bad_signature',
    });
  });

  it.each([undefined, 'Someone'])('rejects the issuer %j', (iss) => {
    expect(verify(signVonageJwt({ body, now, claims: { iss } }))).toEqual({
      valid: false,
      reason: 'bad_issuer',
    });
  });

  it('rejects another API key when one is expected', () => {
    const token = signVonageJwt({ body, now, claims: { api_key: 'other' } });

    expect(verify(token, { apiKey: TEST_API_KEY })).toEqual({
      valid: false,
      reason: 'bad_api_key',
    });
  });

  it.each([-301, 301])('rejects a token issued %i seconds away from now', (offset) => {
    const token = signVonageJwt({ body, now: new Date(now.getTime() + offset * 1000) });

    expect(verify(token)).toEqual({ valid: false, reason: 'stale' });
  });

  it.each([-300, 300])('accepts a token issued %i seconds away from now', (offset) => {
    const token = signVonageJwt({ body, now: new Date(now.getTime() + offset * 1000) });

    expect(verify(token)).toMatchObject({ valid: true });
  });

  it('rejects a body without payload hash', () => {
    expect(verify(signVonageJwt({ now }))).toEqual({
      valid: false,
      reason: 'missing_payload_hash',
    });
  });

  it('rejects a body that does not match the payload hash', () => {
    const token = signVonageJwt({ body: '{"text":"2"}', now });

    expect(verify(token)).toEqual({ valid: false, reason: 'bad_payload_hash' });
  });
});

import { createVerify, generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CLIENT_TOKEN_ACL,
  CLIENT_TOKEN_TTL_SECONDS,
  createClientTokenSigner,
} from './client-token.js';

const APPLICATION_ID = '7f0c1a52-3b9e-4d2f-9a41-6c8e2b1d0f35';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function decodeSegment(segment: string | undefined): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment ?? '', 'base64url').toString('utf8'));
}

function decode(token: string) {
  const [header, payload, signature] = token.split('.');
  const verified = createVerify('RSA-SHA256')
    .update(`${header}.${payload}`)
    .verify(publicKey, Buffer.from(signature ?? '', 'base64url'));

  return { header: decodeSegment(header), claims: decodeSegment(payload), verified };
}

describe('createClientTokenSigner', () => {
  const now = new Date();
  const sign = createClientTokenSigner({ applicationId: APPLICATION_ID, privateKey }, () => now);

  it('signs an RS256 token with the application private key', () => {
    const { header, verified } = decode(sign('cust-1').token);

    expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT' });
    expect(verified).toBe(true);
  });

  it('is for the user and the application, with only the calling ACLs', () => {
    const { claims } = decode(sign('cust-1').token);

    expect(claims).toMatchObject({
      sub: 'cust-1',
      application_id: APPLICATION_ID,
      acl: CLIENT_TOKEN_ACL,
      jti: expect.any(String),
    });
  });

  it(`expires ${CLIENT_TOKEN_TTL_SECONDS / 60} minutes after it is issued`, () => {
    const { token, expiresAt } = sign('cust-1');
    const { claims } = decode(token);
    const issuedAt = Math.floor(now.getTime() / 1000);

    expect(claims.iat).toBe(issuedAt);
    expect(claims.exp).toBe(issuedAt + CLIENT_TOKEN_TTL_SECONDS);
    expect(expiresAt).toEqual(new Date((issuedAt + CLIENT_TOKEN_TTL_SECONDS) * 1000));
  });

  it('gives every token its own id', () => {
    const first = decode(sign('cust-1').token).claims.jti;
    const second = decode(sign('cust-1').token).claims.jti;

    expect(first).not.toBe(second);
  });
});

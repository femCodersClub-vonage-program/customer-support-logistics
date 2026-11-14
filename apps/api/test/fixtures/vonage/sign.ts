import { createHmac } from 'node:crypto';

import { sha256Hex } from '../../../src/webhooks/signature/vonage-jwt.js';

export const TEST_SIGNATURE_SECRET = 'test-signature-secret-0123456789abcdef';

export const TEST_API_KEY = 'test-api-key';

export interface SignVonageJwtOptions {
  secret?: string;
  body?: string | Buffer;
  claims?: Record<string, unknown>;
  header?: Record<string, unknown>;
  now?: Date;
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signVonageJwt({
  secret = TEST_SIGNATURE_SECRET,
  body,
  claims = {},
  header = { alg: 'HS256', typ: 'JWT' },
  now = new Date(),
}: SignVonageJwtOptions = {}): string {
  const payload = {
    iat: Math.floor(now.getTime() / 1000),
    jti: crypto.randomUUID(),
    iss: 'Vonage',
    api_key: TEST_API_KEY,
    ...(body === undefined ? {} : { payload_hash: sha256Hex(Buffer.from(body)) }),
    ...claims,
  };
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');

  return `${unsigned}.${signature}`;
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const VONAGE_JWT_ISSUER = 'Vonage';

export const VONAGE_JWT_MAX_SKEW_SECONDS = 300;

export interface VonageJwtClaims {
  iat: number;
  jti?: string;
  iss: string;
  api_key?: string;
  application_id?: string;
  payload_hash?: string;
}

export type VonageJwtFailure =
  | 'malformed'
  | 'unsupported_algorithm'
  | 'bad_signature'
  | 'bad_issuer'
  | 'bad_api_key'
  | 'stale'
  | 'missing_payload_hash'
  | 'bad_payload_hash';

export type VonageJwtResult =
  { valid: true; claims: VonageJwtClaims } | { valid: false; reason: VonageJwtFailure };

export interface VerifyVonageJwtOptions {
  token: string;
  secret: string;
  rawBody?: Buffer;
  apiKey?: string;
  now?: Date;
  maxSkewSeconds?: number;
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export function verifyVonageJwt({
  token,
  secret,
  rawBody,
  apiKey,
  now = new Date(),
  maxSkewSeconds = VONAGE_JWT_MAX_SKEW_SECONDS,
}: VerifyVonageJwtOptions): VonageJwtResult {
  const segments = token.split('.');

  if (segments.length !== 3) {
    return { valid: false, reason: 'malformed' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments as [string, string, string];
  const header = decodeJson(encodedHeader);
  const payload = decodeJson(encodedPayload);

  if (!isRecord(header) || !isRecord(payload) || typeof payload.iat !== 'number') {
    return { valid: false, reason: 'malformed' };
  }

  if (header.alg !== 'HS256') {
    return { valid: false, reason: 'unsupported_algorithm' };
  }

  const expected = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  if (!safeEqual(Buffer.from(encodedSignature, 'base64url'), expected)) {
    return { valid: false, reason: 'bad_signature' };
  }

  const claims = payload as unknown as VonageJwtClaims;

  if (claims.iss !== VONAGE_JWT_ISSUER) {
    return { valid: false, reason: 'bad_issuer' };
  }

  if (apiKey !== undefined && claims.api_key !== apiKey) {
    return { valid: false, reason: 'bad_api_key' };
  }

  if (Math.abs(now.getTime() / 1000 - claims.iat) > maxSkewSeconds) {
    return { valid: false, reason: 'stale' };
  }

  if (rawBody !== undefined && rawBody.length > 0) {
    if (typeof claims.payload_hash !== 'string') {
      return { valid: false, reason: 'missing_payload_hash' };
    }

    if (
      !safeEqual(Buffer.from(claims.payload_hash.toLowerCase()), Buffer.from(sha256Hex(rawBody)))
    ) {
      return { valid: false, reason: 'bad_payload_hash' };
    }
  }

  return { valid: true, claims };
}

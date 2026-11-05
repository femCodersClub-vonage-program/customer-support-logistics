import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://app:password@localhost:5432/customer_support_logistics';

describe('validateEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ NODE_ENV: 'production', PORT: '8080', DATABASE_URL })).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL,
    });
  });

  it('throws when a variable is invalid', () => {
    expect(() => validateEnv({ PORT: 'not-a-port', DATABASE_URL })).toThrow(
      /Invalid environment variables/,
    );
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a PostgreSQL URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('accepts optional Redis and Vonage variables', () => {
    const env = {
      DATABASE_URL,
      REDIS_URL: 'redis://localhost:6379',
      PUBLIC_URL: 'https://example.ngrok-free.app',
      VONAGE_API_KEY: 'key',
      VONAGE_API_SECRET: 'secret',
      VONAGE_APPLICATION_ID: 'app-id',
      VONAGE_PRIVATE_KEY_PATH: './private.key',
      VONAGE_SIGNATURE_SECRET: 'signature',
    };

    expect(validateEnv(env)).toMatchObject(env);
  });

  it('throws when PUBLIC_URL is not HTTPS', () => {
    expect(() => validateEnv({ DATABASE_URL, PUBLIC_URL: 'http://localhost:3000' })).toThrow(
      /PUBLIC_URL/,
    );
  });
});

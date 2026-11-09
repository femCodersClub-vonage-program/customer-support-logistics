import { describe, expect, it } from 'vitest';

import { VONAGE_REQUIRED_VARIABLES, validateDatabaseEnv, validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://app:password@localhost:5432/customer_support_logistics';

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

const DISABLED = { DATABASE_URL, VONAGE_ENABLED: 'false' };

describe('validateEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv(DISABLED)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      VONAGE_ENABLED: false,
      DEV_AUTH_ENABLED: false,
      WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...DISABLED, NODE_ENV: 'production', PORT: '8080' })).toMatchObject({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  it('parses DEV_AUTH_ENABLED as a boolean', () => {
    expect(validateEnv({ ...DISABLED, DEV_AUTH_ENABLED: 'true' })).toMatchObject({
      DEV_AUTH_ENABLED: true,
    });
  });

  it('throws when DEV_AUTH_ENABLED is enabled in production', () => {
    expect(() =>
      validateEnv({ ...DISABLED, NODE_ENV: 'production', DEV_AUTH_ENABLED: 'true' }),
    ).toThrow(/DEV_AUTH_ENABLED/);
  });

  it('throws when a variable is invalid', () => {
    expect(() => validateEnv({ ...DISABLED, PORT: 'not-a-port' })).toThrow(
      /Invalid environment variables/,
    );
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ VONAGE_ENABLED: 'false' })).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a PostgreSQL URL', () => {
    expect(() =>
      validateEnv({ VONAGE_ENABLED: 'false', DATABASE_URL: 'mysql://localhost:3306/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('accepts an optional Redis URL', () => {
    expect(validateEnv({ ...DISABLED, REDIS_URL: 'redis://localhost:6379' })).toMatchObject({
      REDIS_URL: 'redis://localhost:6379',
    });
  });

  it('coerces WEBHOOK_RATE_LIMIT_PER_MINUTE to a positive integer', () => {
    expect(validateEnv({ ...DISABLED, WEBHOOK_RATE_LIMIT_PER_MINUTE: '5' })).toMatchObject({
      WEBHOOK_RATE_LIMIT_PER_MINUTE: 5,
    });
    expect(() => validateEnv({ ...DISABLED, WEBHOOK_RATE_LIMIT_PER_MINUTE: '0' })).toThrow(
      /WEBHOOK_RATE_LIMIT_PER_MINUTE/,
    );
  });

  it('throws when PUBLIC_URL is not HTTPS', () => {
    expect(() => validateEnv({ ...DISABLED, PUBLIC_URL: 'http://localhost:3000' })).toThrow(
      /PUBLIC_URL/,
    );
  });

  describe('Vonage', () => {
    it('accepts the full Vonage configuration', () => {
      expect(validateEnv({ DATABASE_URL, ...VONAGE_ENV })).toMatchObject({
        VONAGE_ENABLED: true,
        ...VONAGE_ENV,
      });
    });

    it('requires every Vonage variable while Vonage is enabled', () => {
      expect.assertions(VONAGE_REQUIRED_VARIABLES.length);

      for (const variable of VONAGE_REQUIRED_VARIABLES) {
        const env: Record<string, string> = { DATABASE_URL, ...VONAGE_ENV };
        delete env[variable];

        expect(() => validateEnv(env)).toThrow(
          new RegExp(`Required while Vonage is enabled.*\\n.*at ${variable}$`, 'm'),
        );
      }
    });

    it('lists every missing Vonage variable at once', () => {
      expect(() => validateEnv({ DATABASE_URL })).toThrow(
        /VONAGE_API_KEY[\s\S]*VONAGE_SIGNATURE_SECRET[\s\S]*PUBLIC_URL/,
      );
    });

    it('does not require Vonage variables when VONAGE_ENABLED is false', () => {
      expect(() => validateEnv(DISABLED)).not.toThrow();
    });

    it('does not require Vonage variables when NODE_ENV is test', () => {
      expect(validateEnv({ DATABASE_URL, NODE_ENV: 'test' })).toMatchObject({
        VONAGE_ENABLED: true,
      });
    });

    it('still validates the Vonage variables that are set while Vonage is disabled', () => {
      expect(() => validateEnv({ ...DISABLED, VONAGE_VIRTUAL_NUMBER: '600 000 000' })).toThrow(
        /VONAGE_VIRTUAL_NUMBER/,
      );
    });

    it('turns escaped newlines in VONAGE_PRIVATE_KEY into real ones', () => {
      const escaped = PRIVATE_KEY.replaceAll('\n', '\\n');

      expect(validateEnv({ ...DISABLED, VONAGE_PRIVATE_KEY: escaped })).toMatchObject({
        VONAGE_PRIVATE_KEY: PRIVATE_KEY,
      });
    });

    it('throws when VONAGE_PRIVATE_KEY is not a PEM private key', () => {
      expect(() => validateEnv({ ...DISABLED, VONAGE_PRIVATE_KEY: './private.key' })).toThrow(
        /VONAGE_PRIVATE_KEY/,
      );
    });

    it('throws when VONAGE_VIRTUAL_NUMBER is not E.164', () => {
      expect(() =>
        validateEnv({ DATABASE_URL, ...VONAGE_ENV, VONAGE_VIRTUAL_NUMBER: '34600000000' }),
      ).toThrow(/VONAGE_VIRTUAL_NUMBER/);
    });
  });
});

describe('validateDatabaseEnv', () => {
  it('only needs DATABASE_URL, even in production with Vonage enabled', () => {
    expect(validateDatabaseEnv({ NODE_ENV: 'production', DATABASE_URL })).toEqual({
      NODE_ENV: 'production',
      DATABASE_URL,
    });
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateDatabaseEnv({})).toThrow(/DATABASE_URL/);
  });
});

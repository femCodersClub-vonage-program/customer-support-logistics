import { describe, expect, it } from 'vitest';

import {
  VONAGE_REQUIRED_VARIABLES,
  validateDatabaseEnv,
  validateEnv,
  validateSeedEnv,
} from './env.schema.js';

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
  CLIENT_PUBLIC_URL: 'https://client.example.app',
  VONAGE_API_KEY: 'key',
  VONAGE_API_SECRET: 'secret',
  VONAGE_APPLICATION_ID: 'app-id',
  VONAGE_PRIVATE_KEY: PRIVATE_KEY,
  VONAGE_VIRTUAL_NUMBER: '+34600000000',
  VONAGE_SIGNATURE_SECRET: 'signature',
};

const DISABLED = { DATABASE_URL, VONAGE_ENABLED: 'false', ...STORAGE_ENV };

describe('validateEnv', () => {
  it('requires path-style public HTTPS signing for bucket names containing dots', () => {
    const env = {
      ...DISABLED,
      STORAGE_BUCKET: 'evidence.example',
      STORAGE_PUBLIC_ENDPOINT: 'https://storage.example.com',
    };
    expect(() => validateEnv({ ...env, STORAGE_PUBLIC_FORCE_PATH_STYLE: 'false' })).toThrow(
      /STORAGE_PUBLIC_FORCE_PATH_STYLE/,
    );
    expect(() => validateEnv({ ...env, STORAGE_FORCE_PATH_STYLE: 'false' })).toThrow(
      /STORAGE_PUBLIC_FORCE_PATH_STYLE/,
    );
    expect(validateEnv(env).STORAGE_BUCKET).toBe('evidence.example');
  });

  it('accepts an optional public HTTPS storage endpoint and treats empty as unset', () => {
    expect(
      validateEnv({ ...DISABLED, STORAGE_PUBLIC_ENDPOINT: 'https://storage.example.com' })
        .STORAGE_PUBLIC_ENDPOINT,
    ).toBe('https://storage.example.com');
    expect(
      validateEnv({ ...DISABLED, STORAGE_PUBLIC_ENDPOINT: '' }).STORAGE_PUBLIC_ENDPOINT,
    ).toBeUndefined();
    expect(() =>
      validateEnv({ ...DISABLED, STORAGE_PUBLIC_ENDPOINT: 'http://storage.example.com' }),
    ).toThrow(/STORAGE_PUBLIC_ENDPOINT/);
  });
  it('rejects a pending evidence TTL shorter than the upload URL TTL', () => {
    expect(() =>
      validateEnv({
        ...DISABLED,
        EVIDENCE_PENDING_TTL_SECONDS: '899',
        EVIDENCE_UPLOAD_URL_TTL_SECONDS: '900',
      }),
    ).toThrow(/EVIDENCE_PENDING_TTL_SECONDS/);
  });

  it('accepts a pending evidence TTL with a one-minute margin', () => {
    expect(
      validateEnv({
        ...DISABLED,
        EVIDENCE_PENDING_TTL_SECONDS: '960',
        EVIDENCE_UPLOAD_URL_TTL_SECONDS: '900',
      }).EVIDENCE_PENDING_TTL_SECONDS,
    ).toBe(960);
  });

  it('rejects a pending TTL longer than 12 hours', () => {
    expect(() => validateEnv({ ...DISABLED, EVIDENCE_PENDING_TTL_SECONDS: '43201' })).toThrow(
      /EVIDENCE_PENDING_TTL_SECONDS/,
    );
  });

  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv(DISABLED)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      ...Object.fromEntries(
        Object.entries(STORAGE_ENV).map(([key, value]) => [
          key,
          key === 'STORAGE_FORCE_PATH_STYLE' ? true : value,
        ]),
      ),
      VONAGE_ENABLED: false,
      EVIDENCE_IMAGE_MAX_BYTES: 10 * 1024 * 1024,
      EVIDENCE_VIDEO_MAX_BYTES: 50 * 1024 * 1024,
      EVIDENCE_MAX_FILES_PER_INCIDENT: 5,
      EVIDENCE_UPLOAD_URL_TTL_SECONDS: 15 * 60,
      EVIDENCE_PENDING_TTL_SECONDS: 60 * 60,
      EVIDENCE_DOWNLOAD_URL_TTL_SECONDS: 5 * 60,
      JOBS_POLLING_INTERVAL_SECONDS: 2,
      MEDIATION_CALL_DELAY_SECONDS: 2 * 60,
      MEDIATION_RETRY_DELAY_SECONDS: 60,
      WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
    });
  });

  it('reads CLIENT_IP_HEADER as a lowercase header name', () => {
    expect(validateEnv({ ...DISABLED, CLIENT_IP_HEADER: ' X-Real-IP ' })).toMatchObject({
      CLIENT_IP_HEADER: 'x-real-ip',
    });
  });

  it('treats an empty CLIENT_IP_HEADER as unset', () => {
    expect(validateEnv({ ...DISABLED, CLIENT_IP_HEADER: '' }).CLIENT_IP_HEADER).toBeUndefined();
  });

  it('throws when CLIENT_IP_HEADER is not a header name', () => {
    expect(() => validateEnv({ ...DISABLED, CLIENT_IP_HEADER: 'x-real_ip' })).toThrow(
      /CLIENT_IP_HEADER/,
    );
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...DISABLED, NODE_ENV: 'production', PORT: '8080' })).toMatchObject({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  describe('DEV_VERIFY_CODE', () => {
    it('is accepted while Vonage is disabled', () => {
      expect(validateEnv({ ...DISABLED, DEV_VERIFY_CODE: '123456' })).toMatchObject({
        DEV_VERIFY_CODE: '123456',
      });
    });

    it('treats an empty value as unset', () => {
      expect(validateEnv({ ...DISABLED, DEV_VERIFY_CODE: '' }).DEV_VERIFY_CODE).toBeUndefined();
    });

    it('throws when it is not 4 to 10 digits', () => {
      expect(() => validateEnv({ ...DISABLED, DEV_VERIFY_CODE: '12a4' })).toThrow(
        /DEV_VERIFY_CODE/,
      );
    });

    it('throws in production', () => {
      expect(() =>
        validateEnv({ ...DISABLED, NODE_ENV: 'production', DEV_VERIFY_CODE: '123456' }),
      ).toThrow(/DEV_VERIFY_CODE must not be set in production/);
    });

    it('throws while Vonage is enabled, where it would be ignored', () => {
      expect(() =>
        validateEnv({ DATABASE_URL, ...STORAGE_ENV, ...VONAGE_ENV, DEV_VERIFY_CODE: '123456' }),
      ).toThrow(/DEV_VERIFY_CODE only works while Vonage is disabled/);
    });
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

  it('requires storage configuration', () => {
    const env: Record<string, string> = { ...DISABLED };
    delete env.STORAGE_ENDPOINT;

    expect(() => validateEnv(env)).toThrow(/STORAGE_ENDPOINT/);
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

  it('throws when a mediation delay is negative', () => {
    expect(() => validateEnv({ ...DISABLED, MEDIATION_RETRY_DELAY_SECONDS: '-1' })).toThrow(
      /MEDIATION_RETRY_DELAY_SECONDS/,
    );
  });

  it('accepts an HTTP CLIENT_PUBLIC_URL for local development', () => {
    expect(validateEnv({ ...DISABLED, CLIENT_PUBLIC_URL: 'http://localhost:5173' })).toMatchObject({
      CLIENT_PUBLIC_URL: 'http://localhost:5173',
    });
  });

  it('treats an empty CLIENT_PUBLIC_URL as unset', () => {
    expect(validateEnv({ ...DISABLED, CLIENT_PUBLIC_URL: '' }).CLIENT_PUBLIC_URL).toBeUndefined();
  });

  describe('Vonage', () => {
    it('accepts the full Vonage configuration', () => {
      expect(validateEnv({ DATABASE_URL, ...STORAGE_ENV, ...VONAGE_ENV })).toMatchObject({
        VONAGE_ENABLED: true,
        ...VONAGE_ENV,
      });
    });

    it('requires every Vonage variable while Vonage is enabled', () => {
      expect.assertions(VONAGE_REQUIRED_VARIABLES.length);

      for (const variable of VONAGE_REQUIRED_VARIABLES) {
        const env: Record<string, string> = { DATABASE_URL, ...STORAGE_ENV, ...VONAGE_ENV };
        delete env[variable];

        expect(() => validateEnv(env)).toThrow(
          new RegExp(`Required while Vonage is enabled.*\\n.*at ${variable}$`, 'm'),
        );
      }
    });

    it('lists every missing Vonage variable at once', () => {
      expect(() => validateEnv({ DATABASE_URL, ...STORAGE_ENV })).toThrow(
        /VONAGE_API_KEY[\s\S]*VONAGE_SIGNATURE_SECRET[\s\S]*PUBLIC_URL/,
      );
    });

    it('does not require Vonage variables when VONAGE_ENABLED is false', () => {
      expect(() => validateEnv(DISABLED)).not.toThrow();
    });

    it('does not require Vonage variables when NODE_ENV is test', () => {
      expect(validateEnv({ DATABASE_URL, ...STORAGE_ENV, NODE_ENV: 'test' })).toMatchObject({
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
        validateEnv({
          DATABASE_URL,
          ...STORAGE_ENV,
          ...VONAGE_ENV,
          VONAGE_VIRTUAL_NUMBER: '34600000000',
        }),
      ).toThrow(/VONAGE_VIRTUAL_NUMBER/);
    });
  });
});

describe('validateSeedEnv', () => {
  it('treats an empty SEED_AGENT_PASSWORD as unset', () => {
    expect(validateSeedEnv({ DATABASE_URL, SEED_AGENT_PASSWORD: '' })).not.toHaveProperty(
      'SEED_AGENT_PASSWORD',
      expect.anything(),
    );
  });

  it('throws when SEED_AGENT_PASSWORD is shorter than 12 characters', () => {
    expect(() => validateSeedEnv({ DATABASE_URL, SEED_AGENT_PASSWORD: 'short' })).toThrow(
      /SEED_AGENT_PASSWORD/,
    );
  });

  it('splits SEED_CUSTOMER_PHONES on commas and ignores spaces and empty entries', () => {
    expect(
      validateSeedEnv({ DATABASE_URL, SEED_CUSTOMER_PHONES: ' +34600000001, +34600000002 ,' }),
    ).toMatchObject({ SEED_CUSTOMER_PHONES: ['+34600000001', '+34600000002'] });
  });

  it('has no customer phones when SEED_CUSTOMER_PHONES is unset or empty', () => {
    expect(validateSeedEnv({ DATABASE_URL }).SEED_CUSTOMER_PHONES).toEqual([]);
    expect(
      validateSeedEnv({ DATABASE_URL, SEED_CUSTOMER_PHONES: '' }).SEED_CUSTOMER_PHONES,
    ).toEqual([]);
  });

  it('throws when SEED_CUSTOMER_PHONES repeats a phone', () => {
    expect(() =>
      validateSeedEnv({ DATABASE_URL, SEED_CUSTOMER_PHONES: '+34600000001,+34600000001' }),
    ).toThrow(/Each phone must appear once/);
  });

  it('throws when a phone in SEED_CUSTOMER_PHONES is not E.164', () => {
    expect(() =>
      validateSeedEnv({ DATABASE_URL, SEED_CUSTOMER_PHONES: '+34600000001,600000002' }),
    ).toThrow(/SEED_CUSTOMER_PHONES/);
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

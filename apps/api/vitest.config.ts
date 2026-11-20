import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const configuredDatabaseUrl = process.env.DATABASE_URL;
let e2eDatabaseUrl = configuredDatabaseUrl;

if (configuredDatabaseUrl && process.env.CI !== 'true') {
  const localDatabaseUrl = new URL(configuredDatabaseUrl);

  if (
    !['/customer_support_logistics', '/customer_support_logistics_test'].includes(
      localDatabaseUrl.pathname,
    )
  ) {
    throw new Error('Local API e2e tests must use the dedicated test database');
  }

  localDatabaseUrl.pathname = '/customer_support_logistics_test';
  e2eDatabaseUrl = localDatabaseUrl.toString();
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      thresholds: {
        'src/incidents/domain/**': {
          100: true,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          fileParallelism: false,
          env: {
            PUBLIC_URL: 'https://csl.test',
            VONAGE_API_KEY: 'test-api-key',
            VONAGE_SIGNATURE_SECRET: 'test-signature-secret-0123456789abcdef',
            WEBHOOK_RATE_LIMIT_PER_MINUTE: '10000',
            ...(e2eDatabaseUrl ? { DATABASE_URL: e2eDatabaseUrl } : {}),
          },
        },
      },
    ],
  },
});

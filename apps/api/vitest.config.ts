import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error('DATABASE_URL must be configured to run API tests');
}

const testDatabaseUrl = new URL(configuredDatabaseUrl);

if (
  !['/customer_support_logistics', '/customer_support_logistics_test'].includes(
    testDatabaseUrl.pathname,
  )
) {
  throw new Error('API tests must use the dedicated test database');
}

testDatabaseUrl.pathname = '/customer_support_logistics_test';

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
            DATABASE_URL: testDatabaseUrl.toString(),
          },
        },
      },
    ],
  },
});

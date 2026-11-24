import { defineConfig } from 'vitest/config';

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
          include: ['src/**/*.spec.ts', 'test/setup/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          fileParallelism: false,
          globalSetup: ['test/setup/require-test-database.ts'],
          env: {
            PUBLIC_URL: 'https://csl.test',
            VONAGE_API_KEY: 'test-api-key',
            VONAGE_SIGNATURE_SECRET: 'test-signature-secret-0123456789abcdef',
            WEBHOOK_RATE_LIMIT_PER_MINUTE: '10000',
          },
        },
      },
    ],
  },
});

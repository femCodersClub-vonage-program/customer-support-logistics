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
            DEV_AUTH_ENABLED: 'true',
            PUBLIC_URL: 'https://csl.test',
            VONAGE_API_KEY: 'test-api-key',
            VONAGE_SIGNATURE_SECRET: 'test-signature-secret-0123456789abcdef',
            WEBHOOK_RATE_LIMIT_PER_MINUTE: '10000',
            DATABASE_URL:
              process.env.DATABASE_URL ??
              'postgresql://app:dev_only_password@localhost:5432/customer_support_logistics',
          },
        },
      },
    ],
  },
});

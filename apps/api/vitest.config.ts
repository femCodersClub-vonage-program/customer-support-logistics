import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ??
              'postgresql://app:dev_only_password@localhost:5432/customer_support_logistics',
          },
        },
      },
    ],
  },
});

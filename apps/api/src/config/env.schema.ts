import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  PUBLIC_URL: z.url({ protocol: /^https$/ }).optional(),
  VONAGE_API_KEY: z.string().min(1).optional(),
  VONAGE_API_SECRET: z.string().min(1).optional(),
  VONAGE_APPLICATION_ID: z.string().min(1).optional(),
  VONAGE_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  VONAGE_SIGNATURE_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

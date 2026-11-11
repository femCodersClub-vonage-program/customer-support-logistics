import { z } from 'zod';

const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  PUBLIC_URL: z.url({ protocol: /^https$/ }).optional(),
  VONAGE_ENABLED: z.stringbool().default(true),
  VONAGE_API_KEY: z.string().min(1).optional(),
  VONAGE_API_SECRET: z.string().min(1).optional(),
  VONAGE_APPLICATION_ID: z.string().min(1).optional(),
  VONAGE_PRIVATE_KEY: z
    .string()
    .transform((value) => value.replaceAll('\\n', '\n'))
    .refine((value) => PRIVATE_KEY_PATTERN.test(value), {
      message: 'Expected a PEM private key',
    })
    .optional(),
  VONAGE_VIRTUAL_NUMBER: z.e164().optional(),
  VONAGE_SIGNATURE_SECRET: z.string().min(1).optional(),
  DEV_AUTH_ENABLED: z.stringbool().default(false),
  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
});

export const VONAGE_REQUIRED_VARIABLES = [
  'VONAGE_API_KEY',
  'VONAGE_API_SECRET',
  'VONAGE_APPLICATION_ID',
  'VONAGE_PRIVATE_KEY',
  'VONAGE_VIRTUAL_NUMBER',
  'VONAGE_SIGNATURE_SECRET',
  'PUBLIC_URL',
] as const;

export function isVonageEnabled(env: Pick<Env, 'NODE_ENV' | 'VONAGE_ENABLED'>): boolean {
  return env.VONAGE_ENABLED && env.NODE_ENV !== 'test';
}

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.DEV_AUTH_ENABLED) {
    ctx.addIssue({
      code: 'custom',
      path: ['DEV_AUTH_ENABLED'],
      message: 'DEV_AUTH_ENABLED must not be enabled in production',
    });
  }

  if (!isVonageEnabled(env)) {
    return;
  }

  for (const variable of VONAGE_REQUIRED_VARIABLES) {
    if (env[variable] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [variable],
        message: 'Required while Vonage is enabled (set VONAGE_ENABLED=false to disable it)',
      });
    }
  }
});

const databaseEnvSchema = baseEnvSchema.pick({ NODE_ENV: true, DATABASE_URL: true });

const seedEnvSchema = databaseEnvSchema.extend({
  SEED_AGENT_PASSWORD: z.string().min(12).optional(),
});

export type Env = z.infer<typeof envSchema>;

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export type SeedEnv = z.infer<typeof seedEnvSchema>;

function parseEnv<T extends z.ZodType>(schema: T, config: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

export function validateEnv(config: Record<string, unknown>): Env {
  return parseEnv(envSchema, config);
}

export function validateDatabaseEnv(config: Record<string, unknown>): DatabaseEnv {
  return parseEnv(databaseEnvSchema, config);
}

export function validateSeedEnv(config: Record<string, unknown>): SeedEnv {
  return parseEnv(seedEnvSchema, config);
}

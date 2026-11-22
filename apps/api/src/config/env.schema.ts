import { z } from 'zod';

const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  STORAGE_ENDPOINT: z.url({ protocol: /^https?$/ }),
  STORAGE_REGION: z.string().min(1),
  STORAGE_BUCKET: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: z.stringbool(),
  EVIDENCE_IMAGE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  EVIDENCE_VIDEO_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  EVIDENCE_MAX_FILES_PER_INCIDENT: z.coerce.number().int().positive().default(5),
  EVIDENCE_UPLOAD_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  EVIDENCE_PENDING_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60),
  EVIDENCE_DOWNLOAD_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60),
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
  DEV_VERIFY_CODE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[0-9]{4,10}$/, 'Expected 4 to 10 digits')
      .optional(),
  ),
  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  CLIENT_IP_HEADER: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/, 'Expected an HTTP header name, such as x-real-ip')
      .optional(),
  ),
  SILENT_AUTH_REDIRECT_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url({ protocol: /^https$/ }).optional(),
  ),
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
  if (env.DEV_VERIFY_CODE !== undefined && env.NODE_ENV === 'production') {
    ctx.addIssue({
      code: 'custom',
      path: ['DEV_VERIFY_CODE'],
      message: 'DEV_VERIFY_CODE must not be set in production',
    });
  } else if (env.DEV_VERIFY_CODE !== undefined && isVonageEnabled(env)) {
    ctx.addIssue({
      code: 'custom',
      path: ['DEV_VERIFY_CODE'],
      message: 'DEV_VERIFY_CODE only works while Vonage is disabled (set VONAGE_ENABLED=false)',
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
  SEED_AGENT_PASSWORD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(12).optional(),
  ),
  SEED_CUSTOMER_PHONES: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((phone) => phone.trim())
            .filter((phone) => phone !== '')
        : value,
    z
      .array(z.e164())
      .refine((phones) => new Set(phones).size === phones.length, 'Each phone must appear once')
      .default([]),
  ),
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

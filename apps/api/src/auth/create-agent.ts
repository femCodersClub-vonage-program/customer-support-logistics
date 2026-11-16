import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

import { agentLoginBodySchema } from '@csl/contracts';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@csl/shared-types';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

import { validateDatabaseEnv } from '../config/env.schema.js';
import * as schema from '../database/schema/index.js';

import { hashPassword } from './password.js';

const GENERATED_PASSWORD_BYTES = 18;

const createAgentArgsSchema = z.object({
  email: agentLoginBodySchema.shape.email,
  name: z.string().trim().min(1),
  locale: z.enum(SUPPORTED_LOCALES).default(DEFAULT_LOCALE),
});

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    locale: { type: 'string' },
  },
});

const args = createAgentArgsSchema.safeParse(values);

if (!args.success) {
  throw new Error(
    `Usage: agent:create --email <email> --name <name> [--locale ${SUPPORTED_LOCALES.join('|')}]\n${z.prettifyError(args.error)}`,
  );
}

const { DATABASE_URL } = validateDatabaseEnv(process.env);

const password = randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url');
const passwordHash = await hashPassword(password);

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool, schema, casing: 'snake_case' });

try {
  const [agent] = await db
    .insert(schema.agents)
    .values({ ...args.data, passwordHash })
    .onConflictDoNothing({ target: schema.agents.email })
    .returning({ id: schema.agents.id });

  if (!agent) {
    throw new Error(`An agent with the email ${args.data.email} already exists`);
  }

  process.stdout.write(`Agent ${agent.id} created.\nPassword (shown only once): ${password}\n`);
} finally {
  await pool.end();
}

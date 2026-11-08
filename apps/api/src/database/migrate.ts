import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { validateEnv } from '../config/env.schema.js';

const { DATABASE_URL } = validateEnv(process.env);
const pool = new Pool({ connectionString: DATABASE_URL });

try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
} finally {
  await pool.end();
}

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { validateEnv } from '../config/env.schema.js';

import * as schema from './schema/index.js';
import { seedData } from './seed-data.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed demo data with NODE_ENV=production');
}

const { DATABASE_URL } = validateEnv(process.env);

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool, schema, casing: 'snake_case' });

try {
  await db.transaction(async (tx) => {
    await tx.insert(schema.customers).values(seedData.customers).onConflictDoNothing();
    await tx.insert(schema.drivers).values(seedData.drivers).onConflictDoNothing();
    await tx.insert(schema.routes).values(seedData.routes).onConflictDoNothing();
    await tx.insert(schema.orders).values(seedData.orders).onConflictDoNothing();
    await tx.insert(schema.incidents).values(seedData.incidents).onConflictDoNothing();
    await tx.insert(schema.incidentEvents).values(seedData.incidentEvents).onConflictDoNothing();
    await tx.insert(schema.communications).values(seedData.communications).onConflictDoNothing();
  });
} finally {
  await pool.end();
}

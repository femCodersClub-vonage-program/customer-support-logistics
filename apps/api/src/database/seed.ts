import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { hashPassword } from '../auth/password.js';
import { validateSeedEnv } from '../config/env.schema.js';

import * as schema from './schema/index.js';
import { seedData } from './seed-data.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed demo data with NODE_ENV=production');
}

const { DATABASE_URL, SEED_AGENT_PASSWORD, SEED_CUSTOMER_PHONES } = validateSeedEnv(process.env);

if (SEED_CUSTOMER_PHONES.length > seedData.customers.length) {
  throw new Error(
    `SEED_CUSTOMER_PHONES has ${SEED_CUSTOMER_PHONES.length} phones, but there are only ${seedData.customers.length} seeded customers`,
  );
}

const demoPhones = new Set(seedData.customers.map((customer) => customer.phone));

if (SEED_CUSTOMER_PHONES.some((phone) => demoPhones.has(phone))) {
  throw new Error('SEED_CUSTOMER_PHONES must not repeat the demo phone of a seeded customer');
}

const customerPhones = seedData.customers.map((customer, index) => ({
  id: customer.id,
  demoPhone: customer.phone,
  phone: SEED_CUSTOMER_PHONES[index],
}));

const seededAgentIds = seedData.agents
  .map((agent) => agent.id)
  .filter((id): id is string => id !== undefined);

const agentPasswords = SEED_AGENT_PASSWORD
  ? await Promise.all(
      seededAgentIds.map(async (id) => ({
        id,
        passwordHash: await hashPassword(SEED_AGENT_PASSWORD),
      })),
    )
  : [];

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool, schema, casing: 'snake_case' });

try {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.agents)
      .values(seedData.agents)
      .onConflictDoNothing({ target: schema.agents.id });

    for (const { id, passwordHash } of agentPasswords) {
      await tx.update(schema.agents).set({ passwordHash }).where(eq(schema.agents.id, id));
    }

    await tx.insert(schema.customers).values(seedData.customers).onConflictDoNothing();

    for (const { id, demoPhone } of customerPhones) {
      if (id !== undefined) {
        await tx
          .update(schema.customers)
          .set({ phone: demoPhone })
          .where(eq(schema.customers.id, id));
      }
    }

    for (const { id, phone } of customerPhones) {
      if (id !== undefined && phone !== undefined) {
        await tx.update(schema.customers).set({ phone }).where(eq(schema.customers.id, id));
      }
    }
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

import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { agents } from './agents.js';
import { createdAt, id } from './columns.js';
import { customers } from './customers.js';

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text().notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: 'cascade' }),
    agentId: uuid().references(() => agents.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique('sessions_token_hash_unique').on(table.tokenHash),
    check('sessions_one_subject', sql`num_nonnulls(${table.customerId}, ${table.agentId}) = 1`),
    index().on(table.customerId),
    index().on(table.agentId),
  ],
);

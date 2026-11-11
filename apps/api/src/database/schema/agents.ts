import { DEFAULT_LOCALE } from '@csl/shared-types';
import { sql } from 'drizzle-orm';
import { check, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { agentRole, locale } from './enums.js';

export const agents = pgTable(
  'agents',
  {
    id: id(),
    email: text().notNull().unique(),
    name: text().notNull(),
    role: agentRole().notNull().default('agent'),
    locale: locale().notNull().default(DEFAULT_LOCALE),
    passwordHash: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('agents_email_lowercase', sql`${table.email} = lower(${table.email})`)],
);

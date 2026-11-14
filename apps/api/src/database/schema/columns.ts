import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const id = () => uuid().primaryKey().defaultRandom();

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const isE164 = (column: AnyPgColumn) => sql`${column} ~ '^\\+[1-9][0-9]{1,14}$'`;

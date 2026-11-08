import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.js';
import { incidents } from './incidents.js';

export const evidence = pgTable(
  'evidence',
  {
    id: id(),
    incidentId: uuid()
      .notNull()
      .references(() => incidents.id),
    storageKey: text().notNull().unique('evidence_storage_key_unique'),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index().on(table.incidentId),
    check('evidence_size_bytes_non_negative', sql`${table.sizeBytes} >= 0`),
  ],
);

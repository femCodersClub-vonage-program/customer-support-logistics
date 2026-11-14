import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { communicationChannel, communicationDirection, communicationStatus } from './enums.js';
import { incidents } from './incidents.js';

export const communications = pgTable(
  'communications',
  {
    id: id(),
    incidentId: uuid().references(() => incidents.id),
    channel: communicationChannel().notNull(),
    direction: communicationDirection().notNull(),
    fromNumber: text(),
    toNumber: text(),
    vonageUuid: text().notNull().unique('communications_vonage_uuid_unique'),
    status: communicationStatus().notNull(),
    durationSeconds: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index().on(table.incidentId),
    check('communications_duration_seconds_non_negative', sql`${table.durationSeconds} >= 0`),
  ],
);

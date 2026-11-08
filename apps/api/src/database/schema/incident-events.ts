import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { id } from './columns.js';
import { actor, incidentStatus } from './enums.js';
import { incidents } from './incidents.js';

export const incidentEvents = pgTable(
  'incident_events',
  {
    id: id(),
    incidentId: uuid()
      .notNull()
      .references(() => incidents.id, { onDelete: 'restrict' }),
    fromStatus: incidentStatus(),
    toStatus: incidentStatus().notNull(),
    actor: actor().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.incidentId)],
);

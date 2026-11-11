import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { agents } from './agents.js';
import { createdAt, id, updatedAt } from './columns.js';
import { incidentStatus, incidentType } from './enums.js';
import { orders } from './orders.js';

export const incidents = pgTable(
  'incidents',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    type: incidentType().notNull(),
    status: incidentStatus().notNull().default('open'),
    agentId: uuid().references(() => agents.id),
    resolution: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.status), index().on(table.orderId)],
);

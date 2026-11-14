import { date, index, pgTable, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { drivers } from './drivers.js';

export const routes = pgTable(
  'routes',
  {
    id: id(),
    date: date({ mode: 'string' }).notNull(),
    driverId: uuid()
      .notNull()
      .references(() => drivers.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.driverId)],
);

import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { customers } from './customers.js';
import { orderStatus } from './enums.js';
import { routes } from './routes.js';

export const orders = pgTable(
  'orders',
  {
    id: id(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    routeId: uuid().references(() => routes.id),
    address: text().notNull(),
    status: orderStatus().notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.customerId), index().on(table.routeId)],
);

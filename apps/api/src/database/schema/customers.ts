import { DEFAULT_LOCALE } from '@csl/shared-types';
import { check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { createdAt, id, isE164, updatedAt } from './columns.js';
import { locale } from './enums.js';

export const customers = pgTable(
  'customers',
  {
    id: id(),
    name: text().notNull(),
    phone: text().notNull().unique(),
    phoneVerifiedAt: timestamp({ withTimezone: true }),
    locale: locale().notNull().default(DEFAULT_LOCALE),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('customers_phone_e164', isE164(table.phone))],
);

import { DEFAULT_LOCALE } from '@csl/shared-types';
import { boolean, check, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, isE164, updatedAt } from './columns.js';
import { locale } from './enums.js';

export const drivers = pgTable(
  'drivers',
  {
    id: id(),
    name: text().notNull(),
    phone: text().notNull().unique(),
    active: boolean().notNull().default(true),
    locale: locale().notNull().default(DEFAULT_LOCALE),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('drivers_phone_e164', isE164(table.phone))],
);

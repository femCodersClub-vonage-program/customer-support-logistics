import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { id } from './columns.js';
import { communications } from './communications.js';
import { webhookEventSource } from './enums.js';

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    source: webhookEventSource().notNull(),
    eventKey: text().notNull(),
    payload: jsonb().notNull(),
    communicationId: uuid().references(() => communications.id),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('webhook_events_source_event_key_unique').on(table.source, table.eventKey),
    index().on(table.communicationId),
  ],
);

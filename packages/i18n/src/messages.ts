import en from './messages/en.json' with { type: 'json' };
import es from './messages/es.json' with { type: 'json' };

import type { IncidentStatus, IncidentType, Locale, OrderStatus } from '@csl/shared-types';

export type SharedMessages = {
  incidentStatus: Record<IncidentStatus, string>;
  incidentType: Record<IncidentType, string>;
  orderStatus: Record<OrderStatus, string>;
  localeName: Record<Locale, string>;
};

export const sharedMessages: Record<Locale, SharedMessages> = { es, en };

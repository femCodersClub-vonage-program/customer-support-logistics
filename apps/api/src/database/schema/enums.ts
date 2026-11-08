import {
  ACTORS,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_STATUSES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  ORDER_STATUSES,
} from '@csl/shared-types';
import { pgEnum } from 'drizzle-orm/pg-core';

export const orderStatus = pgEnum('order_status', ORDER_STATUSES);

export const incidentStatus = pgEnum('incident_status', INCIDENT_STATUSES);

export const incidentType = pgEnum('incident_type', INCIDENT_TYPES);

export const actor = pgEnum('actor', ACTORS);

export const communicationChannel = pgEnum('communication_channel', COMMUNICATION_CHANNELS);

export const communicationDirection = pgEnum('communication_direction', COMMUNICATION_DIRECTIONS);

export const communicationStatus = pgEnum('communication_status', COMMUNICATION_STATUSES);

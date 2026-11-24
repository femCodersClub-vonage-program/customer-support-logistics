import { INCIDENT_STREAM_EVENT_TYPES } from '@csl/shared-types';
import { z } from 'zod';

import { isoDateTimeSchema, uuidSchema } from './common.js';
import { incidentStatusSchema } from './incidents.js';

import type { IncidentStreamEvent } from '@csl/shared-types';

export const incidentStreamEventTypeSchema = z
  .enum(INCIDENT_STREAM_EVENT_TYPES)
  .meta({ id: 'IncidentStreamEventType' });

export const incidentStreamEventSchema = z
  .object({
    type: incidentStreamEventTypeSchema,
    incidentId: uuidSchema,
    status: incidentStatusSchema.optional(),
    updatedAt: isoDateTimeSchema,
  })
  .meta({ id: 'IncidentStreamEvent' }) satisfies z.ZodType<IncidentStreamEvent>;

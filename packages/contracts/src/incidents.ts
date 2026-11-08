import {
  ACTORS,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_STATUSES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  SUPPORTED_LOCALES,
} from '@csl/shared-types';
import { z } from 'zod';

import { isoDateTimeSchema, paginatedSchema, paginationQuerySchema, uuidSchema } from './common.js';
import { orderSchema } from './orders.js';

import type { Communication, Incident, IncidentEvent } from '@csl/shared-types';

export const incidentStatusSchema = z.enum(INCIDENT_STATUSES).meta({ id: 'IncidentStatus' });

export const incidentTypeSchema = z.enum(INCIDENT_TYPES).meta({ id: 'IncidentType' });

export const actorSchema = z.enum(ACTORS).meta({ id: 'Actor' });

export const incidentSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    type: incidentTypeSchema,
    status: incidentStatusSchema,
    agentId: uuidSchema.nullable(),
    resolution: z.string().nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    closedAt: isoDateTimeSchema.nullable(),
  })
  .meta({ id: 'Incident' }) satisfies z.ZodType<Incident>;

export const incidentEventSchema = z
  .object({
    id: uuidSchema,
    incidentId: uuidSchema,
    fromStatus: incidentStatusSchema.nullable(),
    toStatus: incidentStatusSchema,
    actor: actorSchema,
    actorId: uuidSchema.nullable(),
    reason: z.string().nullable(),
    occurredAt: isoDateTimeSchema,
  })
  .meta({ id: 'IncidentEvent' }) satisfies z.ZodType<IncidentEvent>;

export const communicationSchema = z
  .object({
    id: uuidSchema,
    incidentId: uuidSchema,
    channel: z.enum(COMMUNICATION_CHANNELS),
    direction: z.enum(COMMUNICATION_DIRECTIONS),
    vonageUuid: z.string(),
    status: z.enum(COMMUNICATION_STATUSES),
    durationSeconds: z.number().int().min(0).nullable(),
  })
  .meta({ id: 'Communication' }) satisfies z.ZodType<Communication>;

export const incidentCustomerSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    phone: z.string(),
    locale: z.enum(SUPPORTED_LOCALES),
  })
  .meta({ id: 'IncidentCustomer' });

export const incidentCustomerSummarySchema = incidentCustomerSchema
  .pick({ id: true, name: true })
  .meta({ id: 'IncidentCustomerSummary' });

export const incidentDriverSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
  })
  .meta({ id: 'IncidentDriver' });

export const incidentListItemSchema = incidentSchema
  .extend({ customer: incidentCustomerSummarySchema })
  .meta({ id: 'IncidentListItem' });

export type IncidentListItem = z.infer<typeof incidentListItemSchema>;

export const incidentDetailSchema = incidentSchema
  .extend({
    order: orderSchema,
    customer: incidentCustomerSchema,
    driver: incidentDriverSchema.nullable(),
    events: z.array(incidentEventSchema),
    communications: z.array(communicationSchema),
  })
  .meta({ id: 'IncidentDetail' });

export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

export const incidentIdParamsSchema = z.object({ id: uuidSchema });

export type IncidentIdParams = z.infer<typeof incidentIdParamsSchema>;

export const createIncidentBodySchema = z
  .object({
    orderId: uuidSchema,
    type: incidentTypeSchema,
  })
  .meta({ id: 'CreateIncidentBody' });

export type CreateIncidentBody = z.infer<typeof createIncidentBodySchema>;

export const changeIncidentStatusBodySchema = z
  .object({
    status: incidentStatusSchema,
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .meta({ id: 'ChangeIncidentStatusBody' });

export type ChangeIncidentStatusBody = z.infer<typeof changeIncidentStatusBodySchema>;

export const UNASSIGNED_AGENT = 'unassigned';

export const INCIDENT_SORT_FIELDS = ['createdAt', 'updatedAt'] as const;

export type IncidentSortField = (typeof INCIDENT_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

export const listIncidentsQuerySchema = paginationQuerySchema
  .extend({
    status: z
      .union([incidentStatusSchema, z.array(incidentStatusSchema).min(1)], {
        error: `Expected one or more of: ${INCIDENT_STATUSES.join(', ')}`,
      })
      .transform((value) => (Array.isArray(value) ? value : [value]))
      .optional(),
    type: incidentTypeSchema.optional(),
    agentId: z.union([uuidSchema, z.literal(UNASSIGNED_AGENT)]).optional(),
    createdFrom: isoDateTimeSchema.optional(),
    createdTo: isoDateTimeSchema.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(INCIDENT_SORT_FIELDS).default('createdAt'),
    order: z.enum(SORT_ORDERS).default('desc'),
  })
  .refine(
    ({ createdFrom, createdTo }) =>
      createdFrom === undefined ||
      createdTo === undefined ||
      Date.parse(createdFrom) <= Date.parse(createdTo),
    { path: ['createdTo'], message: 'createdTo must not be earlier than createdFrom' },
  );

export type ListIncidentsQueryInput = z.input<typeof listIncidentsQuerySchema>;

export type ListIncidentsQuery = z.output<typeof listIncidentsQuerySchema>;

export const listIncidentsResponseSchema = paginatedSchema(incidentListItemSchema).meta({
  id: 'ListIncidentsResponse',
});

export type ListIncidentsResponse = z.infer<typeof listIncidentsResponseSchema>;

import {
  ACTORS,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_STATUSES,
  EVIDENCE_STATUSES,
  INCIDENT_EVENT_KINDS,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  SUPPORTED_LOCALES,
} from '@csl/shared-types';
import { z } from 'zod';

import { isoDateTimeSchema, paginatedSchema, paginationQuerySchema, uuidSchema } from './common.js';
import { orderSchema } from './orders.js';

import type { Communication, Evidence, Incident, IncidentEvent } from '@csl/shared-types';

export const incidentStatusSchema = z.enum(INCIDENT_STATUSES).meta({ id: 'IncidentStatus' });

export const incidentTypeSchema = z.enum(INCIDENT_TYPES).meta({ id: 'IncidentType' });

export const actorSchema = z.enum(ACTORS).meta({ id: 'Actor' });

export const incidentEventKindSchema = z
  .enum(INCIDENT_EVENT_KINDS)
  .meta({ id: 'IncidentEventKind' });

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
    kind: incidentEventKindSchema,
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
    incidentId: uuidSchema.nullable(),
    channel: z.enum(COMMUNICATION_CHANNELS),
    direction: z.enum(COMMUNICATION_DIRECTIONS),
    fromNumber: z.string().nullable(),
    toNumber: z.string().nullable(),
    vonageUuid: z.string().nullable(),
    status: z.enum(COMMUNICATION_STATUSES),
    durationSeconds: z.number().int().min(0).nullable(),
    createdAt: isoDateTimeSchema,
  })
  .meta({ id: 'Communication' }) satisfies z.ZodType<Communication>;

export const evidenceSchema = z
  .object({
    id: uuidSchema,
    incidentId: uuidSchema,
    storageKey: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    status: z.enum(EVIDENCE_STATUSES),
    createdAt: isoDateTimeSchema,
  })
  .meta({ id: 'Evidence' }) satisfies z.ZodType<Evidence>;
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
    description: z.string().nullable(),
    order: orderSchema,
    customer: incidentCustomerSchema,
    driver: incidentDriverSchema.nullable(),
    events: z.array(incidentEventSchema),
    communications: z.array(communicationSchema),
    evidence: z.array(evidenceSchema),
  })
  .meta({ id: 'IncidentDetail' });

export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

export const incidentIdParamsSchema = z.object({ id: uuidSchema });

export const idempotencyKeyHeaderSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.trim().length > 0, {
    message: 'Idempotency-Key must not be empty',
  })
  .meta({ id: 'IdempotencyKeyHeader' });

export type IncidentIdParams = z.infer<typeof incidentIdParamsSchema>;

export const INCIDENT_DESCRIPTION_MAX_LENGTH = 1000;

export const createIncidentBodySchema = z
  .object({
    orderId: uuidSchema,
    type: incidentTypeSchema,
    description: z
      .string()
      .trim()
      .min(1)
      .max(INCIDENT_DESCRIPTION_MAX_LENGTH)
      .meta({ description: 'Required when type is other' })
      .optional(),
  })
  .refine(({ type, description }) => type !== 'other' || description !== undefined, {
    path: ['description'],
    message: 'description is required when type is other',
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

export const evidenceIdParamsSchema = incidentIdParamsSchema.extend({ evidenceId: uuidSchema });

export type EvidenceIdParams = z.infer<typeof evidenceIdParamsSchema>;

export const requestEvidenceUploadBodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().positive(),
});

export type RequestEvidenceUploadBody = z.infer<typeof requestEvidenceUploadBodySchema>;

export const evidenceUploadUrlSchema = z.object({
  evidenceId: uuidSchema,
  uploadUrl: z.url(),
  expiresAt: isoDateTimeSchema,
});

export type EvidenceUploadUrl = z.infer<typeof evidenceUploadUrlSchema>;

export const evidenceDownloadSchema = z.object({
  id: uuidSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  downloadUrl: z.url(),
});

export type EvidenceDownload = z.infer<typeof evidenceDownloadSchema>;

export const startMediationResponseSchema = z
  .object({ incident: incidentSchema, call: communicationSchema })
  .meta({ id: 'StartMediationResponse' });
export type StartMediationResponse = z.infer<typeof startMediationResponseSchema>;

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

export const incidentStatusCountsSchema = z
  .record(incidentStatusSchema, z.number().int().min(0))
  .meta({ id: 'IncidentStatusCounts' });
export type IncidentStatusCounts = z.infer<typeof incidentStatusCountsSchema>;
export const listIncidentsResponseSchema = paginatedSchema(incidentListItemSchema)
  .extend({ statusCounts: incidentStatusCountsSchema })
  .meta({
    id: 'ListIncidentsResponse',
  });

export type ListIncidentsResponse = z.infer<typeof listIncidentsResponseSchema>;

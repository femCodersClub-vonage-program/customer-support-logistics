import {
  apiErrorResponseSchema,
  changeIncidentStatusBodySchema,
  createIncidentBodySchema,
  incidentDetailSchema,
  incidentIdParamsSchema,
  incidentSchema,
  listIncidentsQuerySchema,
  listIncidentsResponseSchema,
  listOrdersResponseSchema,
} from '@csl/contracts';
import { createDocument } from 'zod-openapi';

import { DEV_ACTOR_HEADER } from '../common/dev-auth/dev-actor.js';
import { APP_VERSION } from '../version.js';

import type { z } from 'zod';
import type { ZodOpenApiResponseObject, ZodOpenApiResponsesObject } from 'zod-openapi';

const json = (description: string, schema: z.ZodType): ZodOpenApiResponseObject => ({
  description,
  content: { 'application/json': { schema } },
});

const error = (description: string) => json(description, apiErrorResponseSchema);

const unauthorized = error(`Missing or invalid \`${DEV_ACTOR_HEADER}\` header`);

const commonErrors: ZodOpenApiResponsesObject = {
  '400': error('Invalid input, with one entry per offending field in `details`'),
  '401': unauthorized,
};

const incidentErrors: ZodOpenApiResponsesObject = {
  ...commonErrors,
  '404': error('The incident does not exist or does not belong to the customer'),
};

export function createOpenApiDocument(): ReturnType<typeof createDocument> {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Customer Support Logistics API',
      version: APP_VERSION,
      description: [
        'Until authentication lands, protected routes need the temporary, development-only',
        `\`${DEV_ACTOR_HEADER}\` header (\`customer:<uuid>\` or \`agent:<uuid>\`) and`,
        '`DEV_AUTH_ENABLED=true`.',
        '',
        'Lists use `limit` / `offset` pagination and return `total`.',
      ].join('\n'),
    },
    components: {
      securitySchemes: {
        devActor: {
          type: 'apiKey',
          in: 'header',
          name: DEV_ACTOR_HEADER,
          description: 'Temporary, development-only actor: `customer:<uuid>` or `agent:<uuid>`',
        },
      },
    },
    security: [{ devActor: [] }],
    paths: {
      '/incidents': {
        post: {
          tags: ['incidents'],
          summary: 'Create an incident for one of the customer’s orders',
          requestBody: { content: { 'application/json': { schema: createIncidentBodySchema } } },
          responses: {
            '201': json('The created incident', incidentSchema),
            ...commonErrors,
            '403': error('Only customers can create incidents'),
            '404': error('The order does not exist or does not belong to the customer'),
          },
        },
        get: {
          tags: ['incidents'],
          summary: 'List incidents for the CRM inbox',
          description:
            'Repeat `status` to filter by several statuses. `agentId=unassigned` returns incidents without an agent. `q` searches the order id and the customer’s name and phone.',
          requestParams: { query: listIncidentsQuerySchema },
          responses: {
            '200': json('A page of incidents', listIncidentsResponseSchema),
            ...commonErrors,
          },
        },
      },
      '/incidents/{id}': {
        get: {
          tags: ['incidents'],
          summary: 'Incident detail with order, customer, driver, events and communications',
          requestParams: { path: incidentIdParamsSchema },
          responses: {
            '200': json('The incident detail', incidentDetailSchema),
            ...incidentErrors,
          },
        },
      },
      '/incidents/{id}/status': {
        patch: {
          tags: ['incidents'],
          summary: 'Change the incident status through the state machine',
          requestParams: { path: incidentIdParamsSchema },
          requestBody: {
            content: { 'application/json': { schema: changeIncidentStatusBodySchema } },
          },
          responses: {
            '200': json('The updated incident', incidentSchema),
            ...incidentErrors,
            '409': error('The transition is not allowed from the current status or for the actor'),
          },
        },
      },
      '/orders': {
        get: {
          tags: ['orders'],
          summary: 'The customer’s orders',
          responses: {
            '200': json('The customer’s orders', listOrdersResponseSchema),
            '401': unauthorized,
            '403': error('Only customers have orders'),
          },
        },
      },
    },
  });
}

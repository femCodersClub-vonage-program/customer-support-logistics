import {
  agentLoginBodySchema,
  apiErrorResponseSchema,
  changeIncidentStatusBodySchema,
  communicationSchema,
  createIncidentBodySchema,
  currentUserSchema,
  customerLoginCheckBodySchema,
  customerLoginStartBodySchema,
  customerLoginStartResponseSchema,
  incidentDetailSchema,
  incidentIdParamsSchema,
  incidentSchema,
  listIncidentsQuerySchema,
  listIncidentsResponseSchema,
  listOrdersResponseSchema,
  startMediationResponseSchema,
} from '@csl/contracts';
import { createDocument } from 'zod-openapi';

import {
  AGENT_LOGIN_ATTEMPTS_PER_MINUTE,
  CUSTOMER_LOGIN_CHECKS_PER_MINUTE,
  CUSTOMER_LOGIN_STARTS_PER_WINDOW,
  CUSTOMER_LOGIN_START_WINDOW_MS,
} from '../auth/auth.controller.js';
import { DEV_ACTOR_HEADER } from '../auth/dev-actor.js';
import { VERIFICATION_TTL_MS } from '../auth/pending-verifications.js';
import { SESSION_COOKIE, VERIFICATION_COOKIE } from '../auth/session-cookie.js';
import { APP_VERSION } from '../version.js';

import type { z } from 'zod';
import type { ZodOpenApiResponseObject, ZodOpenApiResponsesObject } from 'zod-openapi';

const json = (description: string, schema: z.ZodType): ZodOpenApiResponseObject => ({
  description,
  content: { 'application/json': { schema } },
});

const error = (description: string) => json(description, apiErrorResponseSchema);

const unauthorized = error('No valid session');

const commonErrors: ZodOpenApiResponsesObject = {
  '400': error('Invalid input, with one entry per offending field in `details`'),
  '401': unauthorized,
};

const forbiddenFor = (role: string) => error(`Not available for ${role}`);

const incidentErrors: ZodOpenApiResponsesObject = {
  ...commonErrors,
  '404': error('The incident does not exist or does not belong to the customer'),
};

const driverCallErrors: ZodOpenApiResponsesObject = {
  ...incidentErrors,
  '403': forbiddenFor('customers'),
  '404': error('The incident does not exist'),
  '502': error('Vonage could not create the call; the agent can try again'),
};

export function createOpenApiDocument(): ReturnType<typeof createDocument> {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Customer Support Logistics API',
      version: APP_VERSION,
      description: [
        `Protected routes need the \`${SESSION_COOKIE}\` session cookie, set by the login endpoints.`,
        'While the CRM and the PWA move to the real login, development also accepts the temporary',
        `\`${DEV_ACTOR_HEADER}\` header (\`customer:<uuid>\` or \`agent:<uuid>\`) with`,
        '`DEV_AUTH_ENABLED=true`.',
        '',
        'Lists use `limit` / `offset` pagination and return `total`.',
      ].join('\n'),
    },
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: SESSION_COOKIE,
          description: 'Opaque session id, `HttpOnly`, set by the login endpoints',
        },
        devActor: {
          type: 'apiKey',
          in: 'header',
          name: DEV_ACTOR_HEADER,
          description: 'Temporary, development-only actor: `customer:<uuid>` or `agent:<uuid>`',
        },
      },
    },
    security: [{ session: [] }, { devActor: [] }],
    paths: {
      '/auth/agent/login': {
        post: {
          tags: ['auth'],
          summary: 'Log an agent in with email and password',
          description: `Sets the \`${SESSION_COOKIE}\` cookie.`,
          security: [],
          requestBody: { content: { 'application/json': { schema: agentLoginBodySchema } } },
          responses: {
            '200': json('The agent who logged in', currentUserSchema),
            '400': error('Invalid input, with one entry per offending field in `details`'),
            '401': error('Wrong email or password'),
            '429': error(
              `More than ${AGENT_LOGIN_ATTEMPTS_PER_MINUTE} attempts in a minute from the same IP`,
            ),
          },
        },
      },
      '/auth/customer/start': {
        post: {
          tags: ['auth'],
          summary: 'Send a login code by SMS to a customer',
          description: [
            `Starts a Verify request in the customer's language and keeps its id in the \`${VERIFICATION_COOKIE}\` cookie (\`HttpOnly\`, ${VERIFICATION_TTL_MS / 60_000} minutes).`,
            'An unknown phone gets the same answer, without any SMS, and its codes are always wrong.',
          ].join(' '),
          security: [],
          requestBody: {
            content: { 'application/json': { schema: customerLoginStartBodySchema } },
          },
          responses: {
            '200': json('The code is on its way', customerLoginStartResponseSchema),
            '400': error('The phone is not in E.164 format'),
            '429': error(
              `Verify blocks the number for now, or more than ${CUSTOMER_LOGIN_STARTS_PER_WINDOW} attempts in ${CUSTOMER_LOGIN_START_WINDOW_MS / 60_000} minutes from the same IP or for the same phone`,
            ),
            '502': error('Vonage could not start the verification'),
          },
        },
      },
      '/auth/customer/check': {
        post: {
          tags: ['auth'],
          summary: 'Log a customer in with the code from the SMS',
          description: `Needs the \`${VERIFICATION_COOKIE}\` cookie from \`/auth/customer/start\`. Sets the \`${SESSION_COOKIE}\` cookie and marks the phone as verified.`,
          security: [],
          requestBody: {
            content: { 'application/json': { schema: customerLoginCheckBodySchema } },
          },
          responses: {
            '200': json('The customer who logged in', currentUserSchema),
            '400': error('Invalid input, with one entry per offending field in `details`'),
            '401': error('`INVALID_CODE`: wrong code; the customer can try again'),
            '410': error(
              '`VERIFICATION_EXPIRED` or `TOO_MANY_ATTEMPTS`: the customer has to ask for a new code',
            ),
            '429': error(
              `Verify asks to wait, or more than ${CUSTOMER_LOGIN_CHECKS_PER_MINUTE} attempts in a minute from the same IP`,
            ),
            '502': error('Vonage could not check the code'),
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['auth'],
          summary: 'End the current session',
          description: `Deletes the session and clears the \`${SESSION_COOKIE}\` cookie. Answers \`204\` even without a session.`,
          security: [],
          responses: { '204': { description: 'Logged out' } },
        },
      },
      '/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'The customer or agent behind the current session',
          responses: {
            '200': json('The current user', currentUserSchema),
            '401': unauthorized,
          },
        },
      },
      '/incidents': {
        post: {
          tags: ['incidents'],
          summary: 'Create an incident for one of the customer’s orders',
          requestBody: { content: { 'application/json': { schema: createIncidentBodySchema } } },
          responses: {
            '201': json('The created incident', incidentSchema),
            ...commonErrors,
            '403': forbiddenFor('agents'),
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
            '403': forbiddenFor('customers'),
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
            '403': forbiddenFor('customers'),
            '409': error('The transition is not allowed from the current status or for the actor'),
          },
        },
      },
      '/incidents/{id}/mediation': {
        post: {
          tags: ['incidents'],
          summary: 'Start the mediation and call the driver',
          description:
            'Moves a `notified` incident to `in_mediation` (nothing changes if it is already in mediation), assigns it to the agent if it has none, and calls the driver, who joins the conversation `inc-<id>` after pressing 1. If Vonage fails, the status change is kept and the agent can call the driver again.',
          requestParams: { path: incidentIdParamsSchema },
          responses: {
            '201': json(
              'The incident and the outbound call to the driver',
              startMediationResponseSchema,
            ),
            ...driverCallErrors,
            '409': error(
              'The incident cannot move to `in_mediation`, has no driver, or a call to the driver is already in progress',
            ),
          },
        },
      },
      '/incidents/{id}/mediation/driver-call': {
        post: {
          tags: ['incidents'],
          summary: 'Call the driver again during the mediation',
          requestParams: { path: incidentIdParamsSchema },
          responses: {
            '201': json('The outbound call to the driver', communicationSchema),
            ...driverCallErrors,
            '409': error(
              'The incident is not in mediation, has no driver, or a call to the driver is already in progress',
            ),
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
            '403': forbiddenFor('agents'),
          },
        },
      },
    },
  });
}

import {
  apiErrorResponseSchema,
  communicationSchema,
  startMediationResponseSchema,
} from '@csl/contracts';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { communications, incidentEvents, incidents } from '../src/database/schema/index.js';
import { STALE_QUEUED_CALL_MS } from '../src/incidents/mediation.service.js';
import { VonageRequestError } from '../src/vonage/vonage.errors.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { actor, ids, seed } from './fixtures/seed.js';
import { vonageFixture } from './fixtures/vonage/index.js';
import { signVonageJwt } from './fixtures/vonage/sign.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse } from '@csl/contracts';
import type { IncidentStatus } from '@csl/shared-types';

const DEV_ACTOR = 'X-Dev-Actor';

const DRIVER_PHONE = '+34600000009';

const driverPromptNcco = (incidentId: string, orderId: string) => [
  {
    action: 'talk',
    text: `Incidencia en el pedido ${orderId}. Pulse 1 para conectar con soporte.`,
    language: 'es-ES',
  },
  {
    action: 'input',
    type: ['dtmf'],
    dtmf: { maxDigits: 1, timeOut: 8 },
    eventUrl: [`https://csl.test/webhooks/voice/input?incident=${incidentId}`],
  },
];

describe('Mediation (e2e)', () => {
  let testApp: TestApp;

  const http = () => request(testApp.app.getHttpServer());

  const startMediation = (incidentId: string, as: string = actor.agentA) =>
    http().post(`/incidents/${incidentId}/mediation`).set(DEV_ACTOR, as);

  const callDriver = (incidentId: string, as: string = actor.agentA) =>
    http().post(`/incidents/${incidentId}/mediation/driver-call`).set(DEV_ACTOR, as);

  const expectError = (body: unknown, code: ApiErrorResponse['error']['code']) => {
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(code);
  };

  const incidentRow = async (incidentId: string) => {
    const [row] = await testApp.db.select().from(incidents).where(eq(incidents.id, incidentId));

    return row!;
  };

  const updateIncident = (incidentId: string, values: Partial<typeof incidents.$inferInsert>) =>
    testApp.db.update(incidents).set(values).where(eq(incidents.id, incidentId));

  const setStatus = (incidentId: string, status: IncidentStatus) =>
    updateIncident(incidentId, { status });

  const eventsOf = (incidentId: string) =>
    testApp.db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, incidentId));

  const voiceCallsOf = (incidentId: string) =>
    testApp.db
      .select()
      .from(communications)
      .where(and(eq(communications.incidentId, incidentId), eq(communications.channel, 'voice')));

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.db);
    await seed(testApp.db);
    testApp.vonage.reset();
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  describe('POST /incidents/:id/mediation', () => {
    it('moves a notified incident to in_mediation, assigns the agent and calls the driver', async () => {
      const response = await startMediation(ids.notifiedIncident).expect(201);

      const { incident, call } = startMediationResponseSchema.parse(response.body);

      expect(incident).toMatchObject({
        id: ids.notifiedIncident,
        status: 'in_mediation',
        agentId: ids.agentA,
      });
      expect(call).toMatchObject({
        incidentId: ids.notifiedIncident,
        channel: 'voice',
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        vonageUuid: 'fake-call-1',
        status: 'queued',
      });
      expect(testApp.vonage.callsTo('createCall')).toEqual([
        {
          operation: 'createCall',
          to: DRIVER_PHONE,
          ncco: driverPromptNcco(ids.notifiedIncident, ids.anaRoutedOrder),
        },
      ]);
      expect(await eventsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({
          fromStatus: 'notified',
          toStatus: 'in_mediation',
          actor: 'agent',
          actorId: ids.agentA,
        }),
      ]);
      expect(await voiceCallsOf(ids.notifiedIncident)).toHaveLength(1);
    });

    it('keeps the agent already assigned to the incident', async () => {
      await updateIncident(ids.notifiedIncident, { agentId: ids.agentB });

      const response = await startMediation(ids.notifiedIncident).expect(201);

      expect(startMediationResponseSchema.parse(response.body).incident.agentId).toBe(ids.agentB);
    });

    it('calls the driver without a new event when the incident is already in mediation', async () => {
      await setStatus(ids.notifiedIncident, 'in_mediation');

      await startMediation(ids.notifiedIncident).expect(201);

      expect(await eventsOf(ids.notifiedIncident)).toEqual([]);
      expect(testApp.vonage.callsTo('createCall')).toHaveLength(1);
    });

    it.each([
      ['open', ids.openIncident],
      ['resolved', ids.resolvedIncident],
      ['escalated', ids.escalatedIncident],
    ] as const)('returns 409 for a %s incident and calls nobody', async (status, incidentId) => {
      const response = await startMediation(incidentId).expect(409);

      expectError(response.body, 'INVALID_TRANSITION');
      expect((await incidentRow(incidentId)).status).toBe(status);
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 409 and changes nothing when the incident has no driver', async () => {
      await setStatus(ids.mediationIncident, 'notified');
      await updateIncident(ids.mediationIncident, { agentId: null });
      const eventsBefore = await eventsOf(ids.mediationIncident);

      const response = await startMediation(ids.mediationIncident).expect(409);

      expectError(response.body, 'CONFLICT');
      expect(await incidentRow(ids.mediationIncident)).toMatchObject({
        status: 'notified',
        agentId: null,
      });
      expect(await eventsOf(ids.mediationIncident)).toHaveLength(eventsBefore.length);
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 409 while a call to the driver is in progress', async () => {
      await startMediation(ids.notifiedIncident).expect(201);

      const response = await startMediation(ids.notifiedIncident).expect(409);

      expectError(response.body, 'CONFLICT');
      expect(testApp.vonage.callsTo('createCall')).toHaveLength(1);
    });

    it('creates a single call when two agents start the mediation at the same time', async () => {
      const responses = await Promise.all([
        startMediation(ids.notifiedIncident),
        startMediation(ids.notifiedIncident),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(testApp.vonage.callsTo('createCall')).toHaveLength(1);
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(1);
    });

    it('ignores a queued call that never got a status update', async () => {
      await testApp.db.insert(communications).values({
        incidentId: ids.notifiedIncident,
        channel: 'voice',
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        vonageUuid: 'stuck-call',
        status: 'queued',
        createdAt: new Date(Date.now() - STALE_QUEUED_CALL_MS - 1000),
      });

      await startMediation(ids.notifiedIncident).expect(201);

      expect(testApp.vonage.callsTo('createCall')).toHaveLength(1);
    });

    it('returns 502 when Vonage fails, keeping the mediation so the agent can retry', async () => {
      testApp.vonage.failNext(
        'createCall',
        new VonageRequestError('createCall', { status: 500, reason: 'Internal Error' }),
      );

      const response = await startMediation(ids.notifiedIncident).expect(502);

      expectError(response.body, 'BAD_GATEWAY');
      expect(await incidentRow(ids.notifiedIncident)).toMatchObject({
        status: 'in_mediation',
        agentId: ids.agentA,
      });
      expect(await voiceCallsOf(ids.notifiedIncident)).toEqual([]);

      await callDriver(ids.notifiedIncident).expect(201);

      expect(await voiceCallsOf(ids.notifiedIncident)).toHaveLength(1);
    });

    it('lets the voice event webhook update the call it created', async () => {
      await startMediation(ids.notifiedIncident).expect(201);

      const body = JSON.stringify(vonageFixture('voice-event-answered', { uuid: 'fake-call-1' }));

      await http()
        .post('/webhooks/voice/event')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${signVonageJwt({ body })}`)
        .send(body)
        .expect(204);

      expect(await voiceCallsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({ vonageUuid: 'fake-call-1', status: 'in_progress' }),
      ]);
    });

    it('returns 403 for customers', async () => {
      const response = await startMediation(ids.notifiedIncident, actor.ana).expect(403);

      expectError(response.body, 'FORBIDDEN');
      expect((await incidentRow(ids.notifiedIncident)).status).toBe('notified');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 404 for an unknown incident', async () => {
      const response = await startMediation(ids.missing).expect(404);

      expectError(response.body, 'NOT_FOUND');
    });
  });

  describe('POST /incidents/:id/mediation/driver-call', () => {
    beforeEach(async () => {
      await setStatus(ids.notifiedIncident, 'in_mediation');
    });

    it('calls the driver again without changing the incident', async () => {
      const response = await callDriver(ids.notifiedIncident).expect(201);

      expect(communicationSchema.parse(response.body)).toMatchObject({
        incidentId: ids.notifiedIncident,
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        status: 'queued',
      });
      expect(testApp.vonage.callsTo('createCall')).toEqual([
        {
          operation: 'createCall',
          to: DRIVER_PHONE,
          ncco: driverPromptNcco(ids.notifiedIncident, ids.anaRoutedOrder),
        },
      ]);
      expect(await incidentRow(ids.notifiedIncident)).toMatchObject({
        status: 'in_mediation',
        agentId: null,
      });
      expect(await eventsOf(ids.notifiedIncident)).toEqual([]);
    });

    it('calls again once the previous call has failed', async () => {
      await callDriver(ids.notifiedIncident).expect(201);
      await callDriver(ids.notifiedIncident).expect(409);
      await testApp.db
        .update(communications)
        .set({ status: 'failed' })
        .where(eq(communications.vonageUuid, 'fake-call-1'));

      await callDriver(ids.notifiedIncident).expect(201);

      expect(testApp.vonage.callsTo('createCall')).toHaveLength(2);
    });

    it('returns 409 when the incident is not in mediation', async () => {
      await setStatus(ids.notifiedIncident, 'notified');

      const response = await callDriver(ids.notifiedIncident).expect(409);

      expectError(response.body, 'CONFLICT');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 403 for customers', async () => {
      const response = await callDriver(ids.notifiedIncident, actor.ana).expect(403);

      expectError(response.body, 'FORBIDDEN');
      expect(testApp.vonage.calls).toEqual([]);
    });
  });
});

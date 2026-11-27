import {
  apiErrorResponseSchema,
  communicationSchema,
  startMediationResponseSchema,
} from '@csl/contracts';
import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { communications, incidentEvents, incidents } from '../src/database/schema/index.js';
import { STALE_QUEUED_CALL_MS } from '../src/incidents/mediation.service.js';
import { VonageRequestError } from '../src/vonage/vonage.errors.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookiesFor } from './fixtures/auth.js';
import { actor, ids, seed } from './fixtures/seed.js';
import { vonageFixture } from './fixtures/vonage/index.js';
import { signVonageJwt } from './fixtures/vonage/sign.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse } from '@csl/contracts';
import type { IncidentStatus } from '@csl/shared-types';

const DRIVER_PHONE = '+34600000009';

const CUSTOMER_PHONE = '+34600000001';

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
  let cookie: Record<keyof typeof actor, string>;

  const http = () => request(testApp.app.getHttpServer());

  const startMediation = (incidentId: string, as: string = cookie.agentA) =>
    http().post(`/incidents/${incidentId}/mediation`).set('Cookie', as);

  const callDriver = (incidentId: string, as: string = cookie.agentA) =>
    http().post(`/incidents/${incidentId}/mediation/driver-call`).set('Cookie', as);

  const endCall = (incidentId: string, as: string = cookie.agentA) =>
    http().post(`/incidents/${incidentId}/mediation/end`).set('Cookie', as);

  const removeParticipant = (incidentId: string, participant: string, as: string = cookie.agentA) =>
    http()
      .post(`/incidents/${incidentId}/mediation/participants/${participant}/remove`)
      .set('Cookie', as);

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

  const smsReservationsOf = (incidentId: string) =>
    testApp.db
      .select()
      .from(communications)
      .where(and(eq(communications.incidentId, incidentId), eq(communications.channel, 'sms')))
      .orderBy(asc(communications.toNumber));

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.db);
    await seed(testApp.db);
    cookie = await sessionCookiesFor(testApp, actor);
    testApp.vonage.reset();
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  describe('POST /incidents/:id/mediation', () => {
    it('moves a notified incident to in_mediation, assigns the agent and schedules the call', async () => {
      const response = await startMediation(ids.notifiedIncident).expect(201);

      const { incident, call } = startMediationResponseSchema.parse(response.body);

      expect(incident).toMatchObject({
        id: ids.notifiedIncident,
        status: 'in_mediation',
        agentId: ids.agentA,
      });
      expect(call).toBeNull();
      expect(testApp.vonage.calls).toEqual([]);
      expect(await smsReservationsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({ toNumber: CUSTOMER_PHONE, status: 'pending' }),
        expect.objectContaining({ toNumber: DRIVER_PHONE, status: 'pending' }),
      ]);
      expect(await eventsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({
          fromStatus: 'notified',
          toStatus: 'in_mediation',
          actor: 'agent',
          actorId: ids.agentA,
        }),
      ]);
      expect(await voiceCallsOf(ids.notifiedIncident)).toEqual([]);
    });

    it('keeps the agent already assigned to the incident', async () => {
      await updateIncident(ids.notifiedIncident, { agentId: ids.agentB });

      const response = await startMediation(ids.notifiedIncident).expect(201);

      expect(startMediationResponseSchema.parse(response.body).incident.agentId).toBe(ids.agentB);
    });

    it('schedules the call without a new event when the incident is already in mediation', async () => {
      await setStatus(ids.notifiedIncident, 'in_mediation');

      await startMediation(ids.notifiedIncident).expect(201);

      expect(await eventsOf(ids.notifiedIncident)).toEqual([]);
      expect(await smsReservationsOf(ids.notifiedIncident)).toHaveLength(2);
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

    it('schedules a single mediation when two agents start it at the same time', async () => {
      const responses = await Promise.all([
        startMediation(ids.notifiedIncident),
        startMediation(ids.notifiedIncident),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([201, 201]);
      expect(await smsReservationsOf(ids.notifiedIncident)).toHaveLength(2);
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(1);
    });

    it('returns 403 for customers', async () => {
      const response = await startMediation(ids.notifiedIncident, cookie.ana).expect(403);

      expectError(response.body, 'FORBIDDEN');
      expect((await incidentRow(ids.notifiedIncident)).status).toBe('notified');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 401 without a session', async () => {
      const response = await http()
        .post(`/incidents/${ids.notifiedIncident}/mediation`)
        .expect(401);

      expectError(response.body, 'UNAUTHORIZED');
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

      await callDriver(ids.notifiedIncident).expect(201);

      expect(testApp.vonage.callsTo('createCall')).toHaveLength(1);
    });

    it('returns 502 when Vonage fails and stores nothing, so the agent can retry', async () => {
      testApp.vonage.failNext(
        'createCall',
        new VonageRequestError('createCall', { status: 500, reason: 'Internal Error' }),
      );

      const response = await callDriver(ids.notifiedIncident).expect(502);

      expectError(response.body, 'BAD_GATEWAY');
      expect(await voiceCallsOf(ids.notifiedIncident)).toEqual([]);

      await callDriver(ids.notifiedIncident).expect(201);

      expect(await voiceCallsOf(ids.notifiedIncident)).toHaveLength(1);
    });

    it('lets the voice event webhook update the call it created', async () => {
      await callDriver(ids.notifiedIncident).expect(201);

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

    it('returns 409 while a scheduled call to the driver is being placed', async () => {
      await testApp.db.insert(communications).values({
        incidentId: ids.notifiedIncident,
        channel: 'voice',
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        status: 'pending',
      });

      const response = await callDriver(ids.notifiedIncident).expect(409);

      expectError(response.body, 'CONFLICT');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 409 when the incident is not in mediation', async () => {
      await setStatus(ids.notifiedIncident, 'notified');

      const response = await callDriver(ids.notifiedIncident).expect(409);

      expectError(response.body, 'CONFLICT');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 403 for customers', async () => {
      const response = await callDriver(ids.notifiedIncident, cookie.ana).expect(403);

      expectError(response.body, 'FORBIDDEN');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 401 without a session', async () => {
      const response = await http()
        .post(`/incidents/${ids.notifiedIncident}/mediation/driver-call`)
        .expect(401);

      expectError(response.body, 'UNAUTHORIZED');
      expect(testApp.vonage.calls).toEqual([]);
    });
  });

  describe('hanging up the conversation', () => {
    const insertLeg = (
      incidentId: string,
      vonageUuid: string,
      values: Partial<typeof communications.$inferInsert> = {},
    ) =>
      testApp.db.insert(communications).values({
        incidentId,
        channel: 'voice',
        direction: 'inbound',
        vonageUuid,
        status: 'in_progress',
        ...values,
      });

    const hungUp = () =>
      testApp.vonage
        .callsTo('hangupCall')
        .map(({ callId }) => callId)
        .sort();

    const statusesOf = async (incidentId: string) =>
      Object.fromEntries(
        (await voiceCallsOf(incidentId)).map(({ vonageUuid, status }) => [
          vonageUuid ?? '',
          status,
        ]),
      );

    beforeEach(async () => {
      await setStatus(ids.notifiedIncident, 'in_mediation');

      await insertLeg(ids.notifiedIncident, 'driver-leg', {
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
      });
      await insertLeg(ids.notifiedIncident, 'customer-leg', { fromNumber: `cust-${ids.ana}` });
      await insertLeg(ids.notifiedIncident, 'agent-leg', { fromNumber: `agent-${ids.agentA}` });
      await insertLeg(ids.notifiedIncident, 'ended-leg', {
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        status: 'completed',
      });
      await testApp.db.insert(communications).values({
        incidentId: ids.notifiedIncident,
        channel: 'sms',
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        vonageUuid: 'sms-1',
        status: 'queued',
      });
      await insertLeg(ids.mediationIncident, 'other-incident-leg', {
        fromNumber: `cust-${ids.ana}`,
      });
    });

    describe('POST /incidents/:id/mediation/end', () => {
      it('hangs up every leg that is still on the call and nothing else', async () => {
        await endCall(ids.notifiedIncident).expect(204);

        expect(hungUp()).toEqual(['agent-leg', 'customer-leg', 'driver-leg']);
      });

      it('leaves the incident and the legs as they were, for the voice events to update', async () => {
        const eventsBefore = await eventsOf(ids.notifiedIncident);

        await endCall(ids.notifiedIncident).expect(204);

        expect(await incidentRow(ids.notifiedIncident)).toMatchObject({ status: 'in_mediation' });
        expect(await eventsOf(ids.notifiedIncident)).toEqual(eventsBefore);
        expect(await statusesOf(ids.notifiedIncident)).toEqual({
          'driver-leg': 'in_progress',
          'customer-leg': 'in_progress',
          'agent-leg': 'in_progress',
          'ended-leg': 'completed',
        });
      });

      it('hangs up a call to the driver that is still ringing and the driver calling in', async () => {
        await testApp.db
          .update(communications)
          .set({ status: 'queued' })
          .where(eq(communications.vonageUuid, 'driver-leg'));
        await insertLeg(ids.notifiedIncident, 'driver-call-in', { fromNumber: DRIVER_PHONE });

        await endCall(ids.notifiedIncident).expect(204);

        expect(hungUp()).toEqual(['agent-leg', 'customer-leg', 'driver-call-in', 'driver-leg']);
      });

      it('returns 409 when no leg is on the call', async () => {
        await testApp.db
          .update(communications)
          .set({ status: 'completed' })
          .where(eq(communications.incidentId, ids.notifiedIncident));

        const response = await endCall(ids.notifiedIncident).expect(409);

        expectError(response.body, 'CONFLICT');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 409 for an incident that never had a call', async () => {
        const response = await endCall(ids.openIncident).expect(409);

        expectError(response.body, 'CONFLICT');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 502 when Vonage fails, still hangs up the other legs and stores nothing', async () => {
        testApp.vonage.failNext(
          'hangupCall',
          new VonageRequestError('hangupCall', { status: 500, reason: 'Internal Error' }),
        );

        const response = await endCall(ids.notifiedIncident).expect(502);

        expectError(response.body, 'BAD_GATEWAY');
        expect(hungUp()).toEqual(['agent-leg', 'customer-leg', 'driver-leg']);
        expect(await incidentRow(ids.notifiedIncident)).toMatchObject({ status: 'in_mediation' });
        expect(await statusesOf(ids.notifiedIncident)).toEqual({
          'driver-leg': 'in_progress',
          'customer-leg': 'in_progress',
          'agent-leg': 'in_progress',
          'ended-leg': 'completed',
        });

        await endCall(ids.notifiedIncident).expect(204);

        expect(testApp.vonage.callsTo('hangupCall')).toHaveLength(6);
      });

      it('returns 404 for an unknown incident', async () => {
        const response = await endCall(ids.missing).expect(404);

        expectError(response.body, 'NOT_FOUND');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 400 for an id that is not a UUID', async () => {
        const response = await endCall('not-a-uuid').expect(400);

        expectError(response.body, 'VALIDATION_FAILED');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 403 for customers', async () => {
        const response = await endCall(ids.notifiedIncident, cookie.ana).expect(403);

        expectError(response.body, 'FORBIDDEN');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 401 without a session', async () => {
        const response = await http()
          .post(`/incidents/${ids.notifiedIncident}/mediation/end`)
          .expect(401);

        expectError(response.body, 'UNAUTHORIZED');
        expect(testApp.vonage.calls).toEqual([]);
      });
    });

    describe('POST /incidents/:id/mediation/participants/:participant/remove', () => {
      it('hangs up only the leg of the customer', async () => {
        await removeParticipant(ids.notifiedIncident, 'customer').expect(204);

        expect(hungUp()).toEqual(['customer-leg']);
      });

      it('hangs up only the calls of the driver, whoever placed them', async () => {
        await insertLeg(ids.notifiedIncident, 'driver-call-in', { fromNumber: DRIVER_PHONE });

        await removeParticipant(ids.notifiedIncident, 'driver').expect(204);

        expect(hungUp()).toEqual(['driver-call-in', 'driver-leg']);
      });

      it('leaves the incident and the legs as they were, for the voice events to update', async () => {
        await removeParticipant(ids.notifiedIncident, 'driver').expect(204);

        expect(await incidentRow(ids.notifiedIncident)).toMatchObject({ status: 'in_mediation' });
        expect(await statusesOf(ids.notifiedIncident)).toMatchObject({
          'driver-leg': 'in_progress',
          'customer-leg': 'in_progress',
          'agent-leg': 'in_progress',
        });
      });

      it('returns 409 when the participant is not on the call', async () => {
        await testApp.db
          .update(communications)
          .set({ status: 'completed' })
          .where(eq(communications.vonageUuid, 'customer-leg'));

        const response = await removeParticipant(ids.notifiedIncident, 'customer').expect(409);

        expectError(response.body, 'CONFLICT');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 409 for the driver of an incident without one', async () => {
        const response = await removeParticipant(ids.mediationIncident, 'driver').expect(409);

        expectError(response.body, 'CONFLICT');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 502 when Vonage fails and stores nothing, so the agent can retry', async () => {
        testApp.vonage.failNext(
          'hangupCall',
          new VonageRequestError('hangupCall', { status: 500, reason: 'Internal Error' }),
        );

        const response = await removeParticipant(ids.notifiedIncident, 'customer').expect(502);

        expectError(response.body, 'BAD_GATEWAY');
        expect(await statusesOf(ids.notifiedIncident)).toMatchObject({
          'customer-leg': 'in_progress',
        });

        await removeParticipant(ids.notifiedIncident, 'customer').expect(204);

        expect(hungUp()).toEqual(['customer-leg', 'customer-leg']);
      });

      it('returns 400 for a participant that cannot be removed', async () => {
        const response = await removeParticipant(ids.notifiedIncident, 'agent').expect(400);

        expectError(response.body, 'VALIDATION_FAILED');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 404 for an unknown incident', async () => {
        const response = await removeParticipant(ids.missing, 'customer').expect(404);

        expectError(response.body, 'NOT_FOUND');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it.each(['customer', 'driver'])('returns 403 for customers removing the %s', async (who) => {
        const response = await removeParticipant(ids.notifiedIncident, who, cookie.ana).expect(403);

        expectError(response.body, 'FORBIDDEN');
        expect(testApp.vonage.calls).toEqual([]);
      });

      it('returns 401 without a session', async () => {
        const response = await http()
          .post(`/incidents/${ids.notifiedIncident}/mediation/participants/customer/remove`)
          .expect(401);

        expectError(response.body, 'UNAUTHORIZED');
        expect(testApp.vonage.calls).toEqual([]);
      });
    });
  });
});

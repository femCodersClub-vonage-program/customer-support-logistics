import { getOptionsToken } from '@nestjs/throttler';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  communications,
  incidentEvents,
  incidents,
  webhookEvents,
} from '../src/database/schema/index.js';
import { BackgroundTasks } from '../src/webhooks/background-tasks.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { ids, seed } from './fixtures/seed.js';
import { vonageFixture } from './fixtures/vonage/index.js';
import { signVonageJwt } from './fixtures/vonage/sign.js';

import type { TestApp } from './fixtures/app.js';
import type { IncidentStatus } from '@csl/shared-types';

const DRIVER_PHONE = '+34600000009';
const VIRTUAL_NUMBER = '+34900000000';

const joinNcco = (incidentId: string) => [{ action: 'conversation', name: `inc-${incidentId}` }];

const INVALID_KEY_NCCO = [
  {
    action: 'talk',
    text: 'No hemos recibido una opción válida. Le volveremos a llamar.',
    language: 'es-ES',
  },
];

describe('Webhooks (e2e)', () => {
  let testApp: TestApp;

  const http = () => request(testApp.app.getHttpServer());

  const signedPost = (path: string, payload: unknown, secret?: string) => {
    const body = JSON.stringify(payload);

    return http()
      .post(path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${signVonageJwt({ body, secret })}`)
      .send(body);
  };

  const signedGet = (path: string, query: Record<string, unknown>) =>
    http().get(path).query(query).set('Authorization', `Bearer ${signVonageJwt()}`);

  const statusOf = async (incidentId: string): Promise<IncidentStatus> => {
    const [incident] = await testApp.db
      .select({ status: incidents.status })
      .from(incidents)
      .where(eq(incidents.id, incidentId));

    return incident!.status;
  };

  const setStatus = (incidentId: string, status: IncidentStatus) =>
    testApp.db.update(incidents).set({ status }).where(eq(incidents.id, incidentId));

  const eventsOf = (incidentId: string) =>
    testApp.db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, incidentId))
      .orderBy(asc(incidentEvents.occurredAt));

  const communicationsWith = (vonageUuid: string) =>
    testApp.db.select().from(communications).where(eq(communications.vonageUuid, vonageUuid));

  const allWebhookEvents = () => testApp.db.select().from(webhookEvents);

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

  describe('signature', () => {
    const endpoints = [
      ['post', '/webhooks/sms/inbound', vonageFixture('messages-inbound-sms')],
      ['post', '/webhooks/sms/status', vonageFixture('messages-status-delivered')],
      ['get', '/webhooks/voice/answer', vonageFixture('voice-answer-driver')],
      ['post', '/webhooks/voice/answer', vonageFixture('voice-answer-driver')],
      ['post', '/webhooks/voice/event', vonageFixture('voice-event-answered')],
      ['post', '/webhooks/voice/input', vonageFixture('voice-input-dtmf')],
    ] as const;

    it.each(endpoints)('rejects %s %s without a signature', async (method, path, payload) => {
      const pending = method === 'get' ? http().get(path).query(payload) : http().post(path);

      await (method === 'get' ? pending : pending.send(payload)).expect(401);

      expect(await allWebhookEvents()).toEqual([]);
    });

    it.each(endpoints.filter(([method]) => method === 'post'))(
      'rejects %s %s signed with another secret',
      async (_method, path, payload) => {
        await signedPost(path, payload, 'another-secret').expect(401);

        expect(await allWebhookEvents()).toEqual([]);
      },
    );

    it('rejects a body changed after signing', async () => {
      const signed = JSON.stringify(vonageFixture('messages-inbound-sms'));
      const forged = JSON.stringify(vonageFixture('messages-inbound-sms', { text: '3' }));

      await http()
        .post('/webhooks/sms/inbound')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${signVonageJwt({ body: signed })}`)
        .send(forged)
        .expect(401);

      expect(await statusOf(ids.notifiedIncident)).toBe('notified');
    });

    it('answers a missing signature with the API error shape', async () => {
      const response = await http().post('/webhooks/voice/event').send({}).expect(401);

      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing Vonage signature' },
      });
    });
  });

  describe('POST /webhooks/sms/inbound', () => {
    it('moves the driver’s notified incident to in_mediation and records the reply', async () => {
      const payload = vonageFixture('messages-inbound-sms');

      await signedPost('/webhooks/sms/inbound', payload).expect(204);

      expect(await statusOf(ids.notifiedIncident)).toBe('in_mediation');
      expect(await eventsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({
          fromStatus: 'notified',
          toStatus: 'in_mediation',
          actor: 'driver',
          actorId: ids.driver,
          reason: 'delivered',
        }),
      ]);
      expect(await communicationsWith(payload.message_uuid as string)).toEqual([
        expect.objectContaining({
          incidentId: ids.notifiedIncident,
          channel: 'sms',
          direction: 'inbound',
          fromNumber: DRIVER_PHONE,
          toNumber: VIRTUAL_NUMBER,
          status: 'completed',
        }),
      ]);
    });

    it.each([
      ['2', 'address_not_found'],
      ['3', 'customer_not_home'],
    ])('records option %s as %s', async (text, reason) => {
      await signedPost(
        '/webhooks/sms/inbound',
        vonageFixture('messages-inbound-sms', { text }),
      ).expect(204);

      expect(await eventsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({ toStatus: 'in_mediation', actor: 'driver', reason }),
      ]);
    });

    it('processes the same event only once', async () => {
      const payload = vonageFixture('messages-inbound-sms');

      await signedPost('/webhooks/sms/inbound', payload).expect(204);
      await signedPost('/webhooks/sms/inbound', payload).expect(204);

      expect(await communicationsWith(payload.message_uuid as string)).toHaveLength(1);
      expect(await allWebhookEvents()).toHaveLength(1);
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(1);
    });

    it('answers an invalid reply with a short SMS and changes nothing', async () => {
      await signedPost(
        '/webhooks/sms/inbound',
        vonageFixture('messages-inbound-sms', { text: 'hola' }),
      ).expect(204);
      await testApp.app.get(BackgroundTasks).whenIdle();

      expect(await statusOf(ids.notifiedIncident)).toBe('notified');
      expect(await eventsOf(ids.notifiedIncident)).toEqual([]);
      expect(testApp.vonage.callsTo('sendSms')).toEqual([
        { operation: 'sendSms', to: DRIVER_PHONE, text: 'CSL: responde 1, 2 o 3.' },
      ]);
      expect(await communicationsWith('fake-sms-1')).toEqual([
        expect.objectContaining({
          incidentId: ids.notifiedIncident,
          direction: 'outbound',
          fromNumber: VIRTUAL_NUMBER,
          toNumber: DRIVER_PHONE,
          status: 'queued',
        }),
      ]);
    });

    it('only stores messages once the incident is already in mediation', async () => {
      await setStatus(ids.notifiedIncident, 'in_mediation');

      await signedPost(
        '/webhooks/sms/inbound',
        vonageFixture('messages-inbound-sms', { text: 'llego en 5 minutos' }),
      ).expect(204);
      await testApp.app.get(BackgroundTasks).whenIdle();

      expect(testApp.vonage.callsTo('sendSms')).toEqual([]);
      expect(await eventsOf(ids.notifiedIncident)).toEqual([]);
    });

    it('stores messages from unknown numbers without an incident', async () => {
      const payload = vonageFixture('messages-inbound-sms', { from: '34611111111' });

      await signedPost('/webhooks/sms/inbound', payload).expect(204);
      await testApp.app.get(BackgroundTasks).whenIdle();

      expect(await communicationsWith(payload.message_uuid as string)).toEqual([
        expect.objectContaining({ incidentId: null, fromNumber: '+34611111111' }),
      ]);
      expect(testApp.vonage.callsTo('sendSms')).toEqual([]);
      expect(await statusOf(ids.notifiedIncident)).toBe('notified');
    });

    it('rejects a signed payload without the required fields', async () => {
      await signedPost('/webhooks/sms/inbound', { text: '1' }).expect(400);
    });
  });

  describe('POST /webhooks/sms/status', () => {
    const messageUuid = vonageFixture('messages-status-delivered').message_uuid as string;

    beforeEach(async () => {
      await testApp.db.insert(communications).values({
        incidentId: ids.notifiedIncident,
        channel: 'sms',
        direction: 'outbound',
        fromNumber: VIRTUAL_NUMBER,
        toNumber: DRIVER_PHONE,
        vonageUuid: messageUuid,
        status: 'queued',
      });
    });

    it('updates the delivery status of the sent SMS once', async () => {
      const payload = vonageFixture('messages-status-delivered');

      await signedPost('/webhooks/sms/status', payload).expect(204);
      await signedPost('/webhooks/sms/status', payload).expect(204);

      const [sms] = await communicationsWith(messageUuid);
      const events = await allWebhookEvents();

      expect(sms).toMatchObject({ status: 'completed' });
      expect(events).toEqual([
        expect.objectContaining({ source: 'messages_status', communicationId: sms!.id }),
      ]);
    });

    it('does not move a delivered SMS back to submitted', async () => {
      await signedPost('/webhooks/sms/status', vonageFixture('messages-status-delivered')).expect(
        204,
      );
      await signedPost(
        '/webhooks/sms/status',
        vonageFixture('messages-status-delivered', { status: 'submitted' }),
      ).expect(204);

      expect(await communicationsWith(messageUuid)).toEqual([
        expect.objectContaining({ status: 'completed' }),
      ]);
    });

    it('marks undeliverable messages as failed', async () => {
      await signedPost(
        '/webhooks/sms/status',
        vonageFixture('messages-status-delivered', { status: 'undeliverable' }),
      ).expect(204);

      expect(await communicationsWith(messageUuid)).toEqual([
        expect.objectContaining({ status: 'failed' }),
      ]);
    });

    it('stores the status of an unknown message without failing', async () => {
      await signedPost(
        '/webhooks/sms/status',
        vonageFixture('messages-status-delivered', { message_uuid: 'unknown-message' }),
      ).expect(204);

      expect(await allWebhookEvents()).toEqual([
        expect.objectContaining({ eventKey: 'unknown-message:delivered', communicationId: null }),
      ]);
    });
  });

  describe('/webhooks/voice/answer', () => {
    it('prompts the driver we are calling, with the input URL of their incident', async () => {
      const response = await signedGet(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-driver'),
      ).expect(200);

      expect(response.body).toEqual([
        {
          action: 'talk',
          text: `Incidencia en el pedido ${ids.anaRoutedOrder}. Pulse 1 para conectar con soporte.`,
          language: 'es-ES',
        },
        {
          action: 'input',
          type: ['dtmf'],
          dtmf: { maxDigits: 1, timeOut: 8 },
          eventUrl: [`https://csl.test/webhooks/voice/input?incident=${ids.notifiedIncident}`],
        },
      ]);
    });

    it('accepts the answer webhook by POST too', async () => {
      const response = await signedPost(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-driver'),
      ).expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('joins a browser call to the conversation of an incident in mediation', async () => {
      const response = await signedGet(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-app'),
      ).expect(200);

      expect(response.body).toEqual(joinNcco(ids.mediationIncident));
    });

    it('hangs up a browser call for an incident that is not in mediation', async () => {
      const response = await signedGet(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-app', {
          custom_data: JSON.stringify({ incidentId: ids.notifiedIncident }),
        }),
      ).expect(200);

      expect(response.body).toEqual([]);
    });

    it('joins the driver calling in to the open mediation', async () => {
      await setStatus(ids.notifiedIncident, 'in_mediation');

      const response = await signedGet(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-driver', { from: '34600000009', to: '34900000000' }),
      ).expect(200);

      expect(response.body).toEqual(joinNcco(ids.notifiedIncident));
    });

    it('hangs up the driver calling in when no mediation is open', async () => {
      const response = await signedGet(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-driver', { from: '34600000009', to: '34900000000' }),
      ).expect(200);

      expect(response.body).toEqual([]);
    });

    it('hangs up calls between unknown numbers', async () => {
      const response = await signedGet(
        '/webhooks/voice/answer',
        vonageFixture('voice-answer-driver', { to: '34611111111' }),
      ).expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('POST /webhooks/voice/event', () => {
    const callUuid = vonageFixture('voice-event-answered').uuid as string;

    it('records the call and follows its lifecycle', async () => {
      await signedPost('/webhooks/voice/event', vonageFixture('voice-event-answered')).expect(204);
      await signedPost('/webhooks/voice/event', vonageFixture('voice-event-completed')).expect(204);

      expect(await communicationsWith(callUuid)).toEqual([
        expect.objectContaining({
          incidentId: ids.notifiedIncident,
          channel: 'voice',
          direction: 'outbound',
          fromNumber: VIRTUAL_NUMBER,
          toNumber: DRIVER_PHONE,
          status: 'completed',
          durationSeconds: 42,
        }),
      ]);
      expect(await allWebhookEvents()).toHaveLength(2);
    });

    it('processes the same event only once', async () => {
      const payload = vonageFixture('voice-event-answered');

      await signedPost('/webhooks/voice/event', payload).expect(204);
      await signedPost('/webhooks/voice/event', payload).expect(204);

      expect(await allWebhookEvents()).toHaveLength(1);
      expect(await communicationsWith(callUuid)).toHaveLength(1);
    });

    it('ignores events that arrive after the call ended', async () => {
      await signedPost('/webhooks/voice/event', vonageFixture('voice-event-completed')).expect(204);
      await signedPost(
        '/webhooks/voice/event',
        vonageFixture('voice-event-answered', {
          status: 'ringing',
          timestamp: '2026-11-09T10:00:50.000Z',
        }),
      ).expect(204);

      expect(await communicationsWith(callUuid)).toEqual([
        expect.objectContaining({ status: 'completed' }),
      ]);
    });

    it('does not change the incident when the call is answered', async () => {
      await signedPost('/webhooks/voice/event', vonageFixture('voice-event-answered')).expect(204);

      expect(await statusOf(ids.notifiedIncident)).toBe('notified');
    });

    it('accepts events without a call id and stores nothing', async () => {
      await signedPost('/webhooks/voice/event', { conversation_uuid: 'CON-1' }).expect(204);

      expect(await allWebhookEvents()).toEqual([]);
    });
  });

  describe('POST /webhooks/voice/input', () => {
    const inputPath = (incidentId: string) => `/webhooks/voice/input?incident=${incidentId}`;

    it('joins the driver who pressed 1 and moves the incident to in_mediation', async () => {
      const response = await signedPost(
        inputPath(ids.notifiedIncident),
        vonageFixture('voice-input-dtmf'),
      ).expect(200);

      expect(response.body).toEqual(joinNcco(ids.notifiedIncident));
      expect(await statusOf(ids.notifiedIncident)).toBe('in_mediation');
      expect(await eventsOf(ids.notifiedIncident)).toEqual([
        expect.objectContaining({
          fromStatus: 'notified',
          toStatus: 'in_mediation',
          actor: 'driver',
          actorId: ids.driver,
          reason: 'accepted_call',
        }),
      ]);
    });

    it('answers a repeated input with the same NCCO and changes the incident once', async () => {
      const payload = vonageFixture('voice-input-dtmf');

      await signedPost(inputPath(ids.notifiedIncident), payload).expect(200);
      const repeated = await signedPost(inputPath(ids.notifiedIncident), payload).expect(200);

      expect(repeated.body).toEqual(joinNcco(ids.notifiedIncident));
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(1);
      expect(await allWebhookEvents()).toHaveLength(1);
    });

    it('joins without a new event when the incident is already in mediation', async () => {
      const response = await signedPost(
        inputPath(ids.mediationIncident),
        vonageFixture('voice-input-dtmf'),
      ).expect(200);

      expect(response.body).toEqual(joinNcco(ids.mediationIncident));
      expect(await eventsOf(ids.mediationIncident)).toHaveLength(3);
    });

    it.each([
      ['another key', { digits: '2', timed_out: false }],
      ['silence', { digits: '', timed_out: true }],
    ])('tells the driver the option was not valid after %s', async (_case, dtmf) => {
      const response = await signedPost(
        inputPath(ids.notifiedIncident),
        vonageFixture('voice-input-dtmf', { dtmf }),
      ).expect(200);

      expect(response.body).toEqual(INVALID_KEY_NCCO);
      expect(await statusOf(ids.notifiedIncident)).toBe('notified');
    });

    it('hangs up when pressing 1 for a closed incident', async () => {
      const response = await signedPost(
        inputPath(ids.resolvedIncident),
        vonageFixture('voice-input-dtmf'),
      ).expect(200);

      expect(response.body).toEqual([]);
    });

    it.each([ids.missing, 'not-a-uuid'])('hangs up for the unknown incident %s', async (id) => {
      const response = await signedPost(inputPath(id), vonageFixture('voice-input-dtmf')).expect(
        200,
      );

      expect(response.body).toEqual([]);
    });
  });

  describe('rate limiting', () => {
    let limited: TestApp;

    beforeAll(async () => {
      limited = await createTestApp((builder) =>
        builder.overrideProvider(getOptionsToken()).useValue([{ ttl: 60_000, limit: 2 }]),
      );
    });

    afterAll(async () => {
      await limited.app.close();
    });

    it('rejects requests over the limit before checking the signature', async () => {
      const server = limited.app.getHttpServer();

      await request(server).post('/webhooks/voice/event').send({}).expect(401);
      await request(server).post('/webhooks/voice/event').send({}).expect(401);

      const response = await request(server).post('/webhooks/voice/event').send({}).expect(429);

      expect(response.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    });
  });
});

import { incidentDetailSchema, startMediationResponseSchema } from '@csl/contracts';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  communications,
  customers,
  drivers,
  incidentEvents,
  incidents,
} from '../src/database/schema/index.js';
import { callFallbackSms, callSoonSms, mediationInviteSms } from '../src/i18n/sms-templates.js';
import { mediationKeys } from '../src/incidents/mediation-keys.js';
import { DRIVER_UNREACHABLE_REASON } from '../src/incidents/mediation.service.js';
import { VonageRequestError } from '../src/vonage/vonage.errors.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookiesFor } from './fixtures/auth.js';
import { advanceJobClock, pendingJobs, runDueJobs } from './fixtures/jobs.js';
import { actor, ids, seed } from './fixtures/seed.js';
import { vonageFixture } from './fixtures/vonage/index.js';
import { signVonageJwt } from './fixtures/vonage/sign.js';

import type { TestApp } from './fixtures/app.js';
import type { IncidentStatus } from '@csl/shared-types';

const DRIVER_PHONE = '+34600000009';
const CUSTOMER_PHONE = '+34600000001';
const INCIDENT = ids.notifiedIncident;
const ORDER = ids.anaRoutedOrder;
const CALL_URL = `https://pwa.csl.test/call/${INCIDENT}`;

describe('Mediation flow (e2e)', () => {
  let testApp: TestApp;
  let cookie: Record<keyof typeof actor, string>;
  let clock = 0;

  const http = () => request(testApp.app.getHttpServer());

  const startMediation = () =>
    http().post(`/incidents/${INCIDENT}/mediation`).set('Cookie', cookie.agentA);

  const signedPost = (path: string, payload: unknown) => {
    const body = JSON.stringify(payload);

    return http()
      .post(path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${signVonageJwt({ body })}`)
      .send(body);
  };

  const nextTimestamp = () => new Date(Date.UTC(2026, 10, 25, 10, 0, clock++)).toISOString();

  const voiceEvent = (uuid: string, status: string, timestamp = nextTimestamp()) =>
    signedPost(
      '/webhooks/voice/event',
      vonageFixture('voice-event-answered', { uuid, status, timestamp }),
    ).expect(204);

  const pressKey = (uuid: string, digits: string, timedOut = false) =>
    signedPost(
      `/webhooks/voice/input?incident=${INCIDENT}`,
      vonageFixture('voice-input-dtmf', {
        uuid,
        timestamp: nextTimestamp(),
        dtmf: { digits, timed_out: timedOut },
      }),
    ).expect(200);

  const smsTo = (phone: string) =>
    testApp.vonage.callsTo('sendSms').filter(({ to }) => to === phone);

  const callsToDriver = () => testApp.vonage.callsTo('createCall');

  const communicationWith = async (idempotencyKey: string) => {
    const [row] = await testApp.db
      .select()
      .from(communications)
      .where(eq(communications.idempotencyKey, idempotencyKey));

    return row;
  };

  const attempt = async (n: number) => {
    const row = await communicationWith(mediationKeys.call(INCIDENT, n));

    expect(row?.vonageUuid).toEqual(expect.any(String));

    return row!.vonageUuid!;
  };

  const eventsOf = (kind: (typeof incidentEvents.$inferSelect)['kind']) =>
    testApp.db
      .select()
      .from(incidentEvents)
      .where(and(eq(incidentEvents.incidentId, INCIDENT), eq(incidentEvents.kind, kind)));

  const setStatus = (status: IncidentStatus) =>
    testApp.db.update(incidents).set({ status }).where(eq(incidents.id, INCIDENT));

  const callJobs = async () =>
    (await pendingJobs(testApp)).filter(({ name }) => name === 'mediation-call');

  const startAndPlaceFirstCall = async () => {
    await startMediation().expect(201);
    await runDueJobs(testApp);
    await advanceJobClock(testApp, 120);

    return attempt(1);
  };

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

  describe('starting the mediation', () => {
    it('sends callSoon to the driver, invites the customer and calls the driver after the delay', async () => {
      const response = await startMediation().expect(201);

      expect(startMediationResponseSchema.parse(response.body)).toMatchObject({
        incident: { id: INCIDENT, status: 'in_mediation' },
        call: null,
      });
      expect(await callJobs()).toEqual([
        expect.objectContaining({ data: { incidentId: INCIDENT, attempt: 1 } }),
      ]);
      expect((await callJobs())[0]!.delaySeconds).toBeGreaterThanOrEqual(119);

      await runDueJobs(testApp);

      expect(smsTo(DRIVER_PHONE)).toEqual([
        {
          operation: 'sendSms',
          to: DRIVER_PHONE,
          text: callSoonSms('es', { orderId: ORDER, minutes: 2 }),
        },
      ]);
      expect(smsTo(CUSTOMER_PHONE)).toEqual([
        {
          operation: 'sendSms',
          to: CUSTOMER_PHONE,
          text: mediationInviteSms('es', { orderId: ORDER, url: CALL_URL }),
        },
      ]);
      expect(callsToDriver()).toEqual([]);

      await advanceJobClock(testApp, 110);

      expect(callsToDriver()).toEqual([]);

      await advanceJobClock(testApp, 10);

      expect(callsToDriver()).toEqual([expect.objectContaining({ to: DRIVER_PHONE })]);
      expect(await communicationWith(mediationKeys.call(INCIDENT, 1))).toMatchObject({
        channel: 'voice',
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        status: 'queued',
      });
    });

    it('records each SMS as an outbound Communication', async () => {
      await startMediation().expect(201);
      await runDueJobs(testApp);

      expect(await communicationWith(mediationKeys.callSoon(INCIDENT))).toMatchObject({
        incidentId: INCIDENT,
        channel: 'sms',
        direction: 'outbound',
        toNumber: DRIVER_PHONE,
        vonageUuid: expect.any(String),
        status: 'queued',
      });
      expect(await communicationWith(mediationKeys.invite(INCIDENT))).toMatchObject({
        incidentId: INCIDENT,
        channel: 'sms',
        direction: 'outbound',
        toNumber: CUSTOMER_PHONE,
        vonageUuid: expect.any(String),
        status: 'queued',
      });
    });

    it('writes each SMS in the locale of its recipient', async () => {
      await testApp.db.update(drivers).set({ locale: 'en' }).where(eq(drivers.id, ids.driver));

      await startMediation().expect(201);
      await runDueJobs(testApp);

      expect(smsTo(DRIVER_PHONE).map(({ text }) => text)).toEqual([
        callSoonSms('en', { orderId: ORDER, minutes: 2 }),
      ]);
      expect(smsTo(CUSTOMER_PHONE).map(({ text }) => text)).toEqual([
        mediationInviteSms('es', { orderId: ORDER, url: CALL_URL }),
      ]);
    });

    it('invites the customer in their own locale', async () => {
      await testApp.db.update(customers).set({ locale: 'en' }).where(eq(customers.id, ids.ana));

      await startMediation().expect(201);
      await runDueJobs(testApp);

      expect(smsTo(CUSTOMER_PHONE).map(({ text }) => text)).toEqual([
        mediationInviteSms('en', { orderId: ORDER, url: CALL_URL }),
      ]);
    });

    it('sends one invite and schedules one call when the mediation is started twice', async () => {
      await startMediation().expect(201);
      await startMediation().expect(201);
      await runDueJobs(testApp);

      expect(smsTo(DRIVER_PHONE)).toHaveLength(1);
      expect(smsTo(CUSTOMER_PHONE)).toHaveLength(1);
      expect(await callJobs()).toHaveLength(1);
    });

    it('keeps the mediation and stores a failed Communication when Vonage rejects an SMS', async () => {
      testApp.vonage.failNext(
        'sendSms',
        new VonageRequestError('sendSms', { status: 500, reason: 'Internal Error' }),
      );

      await startMediation().expect(201);
      await runDueJobs(testApp);

      const smsRows = await testApp.db
        .select()
        .from(communications)
        .where(and(eq(communications.incidentId, INCIDENT), eq(communications.channel, 'sms')));

      expect(smsRows.map(({ status }) => status).sort()).toEqual(['failed', 'queued']);
      expect(await callJobs()).toHaveLength(1);
    });

    it('only invites the customer when the driver has already joined', async () => {
      await pressKey('driver-call-before-mediation', '1');

      await startMediation().expect(201);
      await runDueJobs(testApp);

      expect(smsTo(DRIVER_PHONE)).toEqual([]);
      expect(smsTo(CUSTOMER_PHONE)).toHaveLength(1);
      expect(await callJobs()).toEqual([]);
    });

    it('exposes the invite in the incident detail for the customer', async () => {
      const before = await http()
        .get(`/incidents/${INCIDENT}`)
        .set('Cookie', cookie.ana)
        .expect(200);

      expect(incidentDetailSchema.parse(before.body).mediationInvite).toBeNull();

      await startMediation().expect(201);

      const after = await http()
        .get(`/incidents/${INCIDENT}`)
        .set('Cookie', cookie.ana)
        .expect(200);

      expect(incidentDetailSchema.parse(after.body).mediationInvite).toEqual({
        url: CALL_URL,
        sentAt: expect.any(String),
      });
    });
  });

  describe('retries', () => {
    it('does not retry once the driver presses 1', async () => {
      const callId = await startAndPlaceFirstCall();

      await voiceEvent(callId, 'answered');
      await pressKey(callId, '1');
      await voiceEvent(callId, 'completed');

      expect(await callJobs()).toEqual([]);
      expect(await eventsOf('driver_joined')).toHaveLength(1);

      await advanceJobClock(testApp, 3600);

      expect(callsToDriver()).toHaveLength(1);
    });

    it('places exactly 3 calls, 60 s apart, then sends callFallback once', async () => {
      const first = await startAndPlaceFirstCall();

      await voiceEvent(first, 'unanswered');

      expect(await callJobs()).toEqual([
        expect.objectContaining({ data: { incidentId: INCIDENT, attempt: 2 } }),
      ]);
      expect((await callJobs())[0]!.delaySeconds).toBeGreaterThanOrEqual(59);

      await advanceJobClock(testApp, 50);
      expect(callsToDriver()).toHaveLength(1);

      await advanceJobClock(testApp, 10);
      expect(callsToDriver()).toHaveLength(2);

      const second = await attempt(2);
      await voiceEvent(second, 'answered');
      await pressKey(second, '5');
      await voiceEvent(second, 'completed');

      await advanceJobClock(testApp, 60);
      expect(callsToDriver()).toHaveLength(3);

      await pressKey(await attempt(3), '', true);
      await advanceJobClock(testApp, 3600);

      expect(callsToDriver()).toHaveLength(3);
      expect(smsTo(DRIVER_PHONE).map(({ text }) => text)).toEqual([
        callSoonSms('es', { orderId: ORDER, minutes: 2 }),
        callFallbackSms('es', { orderId: ORDER }),
      ]);
      expect(await communicationWith(mediationKeys.callFallback(INCIDENT))).toMatchObject({
        channel: 'sms',
        toNumber: DRIVER_PHONE,
      });
      expect(await eventsOf('driver_unreachable')).toEqual([
        expect.objectContaining({
          actor: 'system',
          reason: DRIVER_UNREACHABLE_REASON,
          fromStatus: 'in_mediation',
          toStatus: 'in_mediation',
        }),
      ]);
    });

    it.each(['resolved', 'escalated'] as const)(
      'stops calling when the incident is %s between attempts',
      async (status) => {
        const first = await startAndPlaceFirstCall();

        await voiceEvent(first, 'busy');
        await setStatus(status);
        await advanceJobClock(testApp, 60);

        expect(callsToDriver()).toHaveLength(1);
        expect(await communicationWith(mediationKeys.call(INCIDENT, 2))).toBeUndefined();
      },
    );

    it('stops calling when the driver joins by calling back', async () => {
      const first = await startAndPlaceFirstCall();

      await voiceEvent(first, 'unanswered');
      await http()
        .get('/webhooks/voice/answer')
        .query(vonageFixture('voice-answer-driver', { from: '34600000009', to: '34900000000' }))
        .set('Authorization', `Bearer ${signVonageJwt()}`)
        .expect(200);
      await advanceJobClock(testApp, 60);

      expect(callsToDriver()).toHaveLength(1);
      expect(await eventsOf('driver_joined')).toHaveLength(1);
    });

    it('places no extra call for a duplicate voice event', async () => {
      const first = await startAndPlaceFirstCall();
      const timestamp = nextTimestamp();

      await voiceEvent(first, 'unanswered', timestamp);
      await voiceEvent(first, 'unanswered', timestamp);

      expect(await callJobs()).toHaveLength(1);

      await advanceJobClock(testApp, 60);

      expect(callsToDriver()).toHaveLength(2);
    });

    it('places one call when the same attempt runs twice', async () => {
      const first = await startAndPlaceFirstCall();

      await voiceEvent(first, 'unanswered');
      await testApp.db.transaction((tx) =>
        testApp.jobs.send(tx, 'mediation-call', { incidentId: INCIDENT, attempt: 2 }),
      );
      await advanceJobClock(testApp, 60);

      expect(callsToDriver()).toHaveLength(2);
    });

    it('counts a call Vonage did not create as a failed attempt', async () => {
      await startMediation().expect(201);
      await runDueJobs(testApp);
      testApp.vonage.failNext(
        'createCall',
        new VonageRequestError('createCall', { status: 500, reason: 'Internal Error' }),
      );

      await advanceJobClock(testApp, 120);

      expect(await communicationWith(mediationKeys.call(INCIDENT, 1))).toMatchObject({
        status: 'failed',
        vonageUuid: null,
      });
      expect(await callJobs()).toEqual([
        expect.objectContaining({ data: { incidentId: INCIDENT, attempt: 2 } }),
      ]);
    });

    it('keeps the call record when the event webhook arrives before the call id is stored', async () => {
      await setStatus('in_mediation');
      const [reservation] = await testApp.db
        .insert(communications)
        .values({
          incidentId: INCIDENT,
          idempotencyKey: mediationKeys.call(INCIDENT, 1),
          channel: 'voice',
          direction: 'outbound',
          toNumber: DRIVER_PHONE,
          status: 'pending',
        })
        .returning();

      await voiceEvent('early-call', 'unanswered');

      const rows = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.channel, 'voice'));

      expect(rows).toEqual([
        expect.objectContaining({
          id: reservation!.id,
          vonageUuid: 'early-call',
          status: 'failed',
        }),
      ]);
      expect(await callJobs()).toEqual([
        expect.objectContaining({ data: { incidentId: INCIDENT, attempt: 2 } }),
      ]);
    });

    it('does not retry a call the agent placed by hand', async () => {
      await setStatus('in_mediation');

      await http()
        .post(`/incidents/${INCIDENT}/mediation/driver-call`)
        .set('Cookie', cookie.agentA)
        .expect(201);

      expect(callsToDriver()).toHaveLength(1);

      const [manual] = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.channel, 'voice'));

      await voiceEvent(manual!.vonageUuid!, 'unanswered');

      expect(await callJobs()).toEqual([]);
    });
  });

  describe('restarts', () => {
    it('resumes the retries after a restart without placing a duplicate call', async () => {
      const first = await startAndPlaceFirstCall();

      await voiceEvent(first, 'unanswered');
      await testApp.app.close();

      testApp = await createTestApp();
      cookie = await sessionCookiesFor(testApp, actor);

      await advanceJobClock(testApp, 60);
      await runDueJobs(testApp);

      expect(testApp.vonage.callsTo('createCall')).toHaveLength(1);
      expect(await attempt(2)).toEqual(expect.any(String));
      expect(
        await testApp.db.select().from(communications).where(eq(communications.channel, 'voice')),
      ).toHaveLength(2);
    });
  });
});

import {
  apiErrorResponseSchema,
  incidentDetailSchema,
  incidentSchema,
  listIncidentsResponseSchema,
} from '@csl/contracts';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { communications, incidentEvents, incidents } from '../src/database/schema/index.js';
import { VonageRequestError } from '../src/vonage/vonage.errors.js';

import { createTestApp, resetDatabase, waitForLockWait } from './fixtures/app.js';
import { sessionCookiesFor } from './fixtures/auth.js';
import { actor, ids, seed, times } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse, ListIncidentsResponse } from '@csl/contracts';

describe('Incidents (e2e)', () => {
  let testApp: TestApp;
  let cookie: Record<keyof typeof actor, string>;

  const http = () => request(testApp.app.getHttpServer());

  const eventsOf = (incidentId: string) =>
    testApp.db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, incidentId));

  const expectError = (body: unknown, code: ApiErrorResponse['error']['code']) => {
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(code);
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    testApp.vonage.reset();
    await resetDatabase(testApp.db);
    await seed(testApp.db);
    cookie = await sessionCookiesFor(testApp, actor);
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  describe('POST /incidents', () => {
    it('creates an incident for the customer’s order and records the initial event', async () => {
      const response = await http()
        .post('/incidents')
        .set('Cookie', cookie.ana)
        .send({ orderId: ids.anaOrder, type: 'damaged' })
        .expect(201);

      const incident = incidentSchema.parse(response.body);

      expect(incident).toMatchObject({
        orderId: ids.anaOrder,
        type: 'damaged',
        status: 'open',
        agentId: null,
        resolution: null,
        closedAt: null,
      });
      expect(await eventsOf(incident.id)).toEqual([
        expect.objectContaining({
          fromStatus: null,
          toStatus: 'open',
          actor: 'customer',
          actorId: ids.ana,
          reason: null,
          occurredAt: new Date(incident.createdAt),
        }),
      ]);
    });

    it('returns 404 for another customer’s order, without leaking that it exists', async () => {
      const response = await http()
        .post('/incidents')
        .set('Cookie', cookie.ana)
        .send({ orderId: ids.brunoOrder, type: 'damaged' })
        .expect(404);

      expectError(response.body, 'NOT_FOUND');
      expect(response.body).toEqual(
        (
          await http()
            .post('/incidents')
            .set('Cookie', cookie.ana)
            .send({ orderId: ids.missing, type: 'damaged' })
            .expect(404)
        ).body,
      );
    });

    it('returns 400 with the offending fields', async () => {
      const response = await http()
        .post('/incidents')
        .set('Cookie', cookie.ana)
        .send({ orderId: 'not-a-uuid', type: 'lost' })
        .expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
      expect(
        (response.body as ApiErrorResponse).error.details?.map(({ path }) => path).sort(),
      ).toEqual(['orderId', 'type']);
    });

    it('returns 400 for a malformed JSON body', async () => {
      const response = await http()
        .post('/incidents')
        .set('Cookie', cookie.ana)
        .set('Content-Type', 'application/json')
        .send('{"orderId":')
        .expect(400);

      expectError(response.body, 'BAD_REQUEST');
    });

    it('returns 403 for agents', async () => {
      const response = await http()
        .post('/incidents')
        .set('Cookie', cookie.agentA)
        .send({ orderId: ids.anaOrder, type: 'damaged' })
        .expect(403);

      expectError(response.body, 'FORBIDDEN');
    });

    it('returns 401 without a session', async () => {
      const response = await http()
        .post('/incidents')
        .send({ orderId: ids.anaOrder, type: 'damaged' })
        .expect(401);

      expectError(response.body, 'UNAUTHORIZED');
    });
  });

  describe('GET /incidents', () => {
    const list = async (query = '') => {
      const response = await http()
        .get('/incidents')
        .query(query)
        .set('Cookie', cookie.agentA)
        .expect(200);

      return listIncidentsResponseSchema.parse(response.body);
    };

    const idsOf = (page: ListIncidentsResponse) => page.items.map(({ id }) => id);

    it('returns every incident, newest first, with the default page', async () => {
      const page = await list();

      expect(idsOf(page)).toEqual([
        ids.escalatedIncident,
        ids.resolvedIncident,
        ids.mediationIncident,
        ids.notifiedIncident,
        ids.openIncident,
      ]);
      expect(page).toMatchObject({ total: 5, limit: 20, offset: 0 });
      expect(page.items[0]?.customer).toEqual({ id: ids.bruno, name: 'Bruno Díaz' });
    });

    it('filters by one status or several', async () => {
      expect(idsOf(await list('status=open'))).toEqual([ids.openIncident]);
      expect(idsOf(await list('status=open&status=resolved'))).toEqual([
        ids.resolvedIncident,
        ids.openIncident,
      ]);
    });

    it('filters by type', async () => {
      expect(idsOf(await list('type=delayed'))).toEqual([ids.escalatedIncident, ids.openIncident]);
    });

    it('filters by agent, or by unassigned incidents', async () => {
      expect(idsOf(await list(`agentId=${ids.agentA}`))).toEqual([
        ids.resolvedIncident,
        ids.mediationIncident,
      ]);
      expect(idsOf(await list('agentId=unassigned'))).toEqual([
        ids.notifiedIncident,
        ids.openIncident,
      ]);
    });

    it('filters by creation date, both ends included', async () => {
      const page = await list(
        `createdFrom=${times.notified.toISOString()}&createdTo=${times.resolvedCreated.toISOString()}`,
      );

      expect(idsOf(page)).toEqual([
        ids.resolvedIncident,
        ids.mediationIncident,
        ids.notifiedIncident,
      ]);
    });

    it('searches the customer name and phone, ignoring case', async () => {
      expect(idsOf(await list('q=bruno'))).toEqual([ids.escalatedIncident, ids.resolvedIncident]);
      expect(idsOf(await list('q=600000002'))).toEqual([
        ids.escalatedIncident,
        ids.resolvedIncident,
      ]);
    });

    it('searches the order id', async () => {
      expect(idsOf(await list(`q=${ids.anaOrder}`))).toEqual([ids.mediationIncident]);
    });

    it('treats LIKE wildcards in the search as plain text', async () => {
      expect((await list('q=%25')).total).toBe(0);
      expect((await list('q=_')).total).toBe(0);
    });

    it('combines filters', async () => {
      expect(idsOf(await list('status=open&status=notified&type=damaged&q=ana'))).toEqual([
        ids.notifiedIncident,
      ]);
    });

    it('sorts by updatedAt in either direction', async () => {
      const ascending = [
        ids.notifiedIncident,
        ids.mediationIncident,
        ids.escalatedIncident,
        ids.openIncident,
        ids.resolvedIncident,
      ];

      expect(idsOf(await list('sort=updatedAt&order=asc'))).toEqual(ascending);
      expect(idsOf(await list('sort=updatedAt'))).toEqual([...ascending].reverse());
    });

    it('paginates with limit and offset, keeping the total', async () => {
      const page = await list('limit=2&offset=2');

      expect(idsOf(page)).toEqual([ids.mediationIncident, ids.notifiedIncident]);
      expect(page).toMatchObject({ total: 5, limit: 2, offset: 2 });
      expect(await list('limit=2&offset=10')).toMatchObject({ items: [], total: 5 });
    });

    it('counts the incidents of every status, with zeros for the empty ones', async () => {
      expect((await list()).statusCounts).toEqual({
        open: 1,
        notified: 1,
        in_mediation: 1,
        resolved: 1,
        escalated: 1,
      });
      expect((await list('type=wrong_item')).statusCounts).toEqual({
        open: 0,
        notified: 0,
        in_mediation: 0,
        resolved: 1,
        escalated: 0,
      });
    });

    it('counts with every filter except the status one', async () => {
      const page = await list('status=open&type=delayed');

      expect(idsOf(page)).toEqual([ids.openIncident]);
      expect(page.total).toBe(1);
      expect(page.statusCounts).toEqual({
        open: 1,
        notified: 0,
        in_mediation: 0,
        resolved: 0,
        escalated: 1,
      });
    });

    it('does not count an incident twice when a status is repeated', async () => {
      const page = await list('status=open&status=open');

      expect(idsOf(page)).toEqual([ids.openIncident]);
      expect(page.total).toBe(1);
      expect(page.statusCounts).toEqual({
        open: 1,
        notified: 1,
        in_mediation: 1,
        resolved: 1,
        escalated: 1,
      });
    });

    it.each([
      ['limit=0', 'limit'],
      [`limit=101`, 'limit'],
      ['offset=-1', 'offset'],
      ['status=lost', 'status'],
      ['agentId=someone', 'agentId'],
      ['createdFrom=yesterday', 'createdFrom'],
      [
        `createdFrom=${times.escalated.toISOString()}&createdTo=${times.notified.toISOString()}`,
        'createdTo',
      ],
      ['sort=name', 'sort'],
    ])('returns 400 for %s', async (query, field) => {
      const response = await http()
        .get('/incidents')
        .query(query)
        .set('Cookie', cookie.agentA)
        .expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
      expect((response.body as ApiErrorResponse).error.details?.map(({ path }) => path)).toEqual([
        field,
      ]);
    });
  });

  describe('GET /incidents/:id', () => {
    it('returns the detail with order, customer, driver, events and communications', async () => {
      const response = await http()
        .get(`/incidents/${ids.openIncident}`)
        .set('Cookie', cookie.agentA)
        .expect(200);

      const detail = incidentDetailSchema.parse(response.body);

      expect(detail).toMatchObject({
        id: ids.openIncident,
        status: 'open',
        createdAt: times.openCreated.toISOString(),
        updatedAt: times.openUpdated.toISOString(),
        order: { id: ids.anaRoutedOrder, routeId: ids.route, status: 'failed' },
        customer: { id: ids.ana, name: 'Ana García', phone: '+34600000001', locale: 'es' },
        events: [],
        communications: [],
      });
      expect((response.body as Record<string, unknown>).driver).toEqual({
        id: ids.driver,
        name: 'Diego Ruiz',
      });
    });

    it('returns events in chronological order and the communications', async () => {
      const response = await http()
        .get(`/incidents/${ids.mediationIncident}`)
        .set('Cookie', cookie.agentA)
        .expect(200);

      const detail = incidentDetailSchema.parse(response.body);

      expect(detail.driver).toBeNull();
      expect(detail.events.map(({ fromStatus, toStatus }) => [fromStatus, toStatus])).toEqual([
        [null, 'open'],
        ['open', 'notified'],
        ['notified', 'in_mediation'],
      ]);
      expect(detail.events[2]).toMatchObject({
        actor: 'agent',
        actorId: ids.agentA,
        reason: 'Calling the driver',
      });
      expect(detail.communications).toEqual([
        expect.objectContaining({ channel: 'sms', direction: 'outbound', status: 'completed' }),
      ]);
    });

    it('lets customers see their own incidents', async () => {
      await http().get(`/incidents/${ids.openIncident}`).set('Cookie', cookie.ana).expect(200);
    });

    it('returns the same 404 for another customer’s incident and for a missing one', async () => {
      const notYours = await http()
        .get(`/incidents/${ids.openIncident}`)
        .set('Cookie', cookie.bruno)
        .expect(404);
      const missing = await http()
        .get(`/incidents/${ids.missing}`)
        .set('Cookie', cookie.agentA)
        .expect(404);

      expectError(notYours.body, 'NOT_FOUND');
      expect(notYours.body).toEqual(missing.body);
    });

    it('returns 400 for an id that is not a UUID', async () => {
      const response = await http()
        .get('/incidents/not-a-uuid')
        .set('Cookie', cookie.agentA)
        .expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
    });
  });

  describe('POST /incidents/:id/assign-to-me', () => {
    const assign = (id: string, who: string = cookie.agentA) =>
      http().post(`/incidents/${id}/assign-to-me`).set('Cookie', who);

    it('assigns the incident to the current agent and records an event', async () => {
      const response = await assign(ids.openIncident).expect(201);

      expect(incidentSchema.parse(response.body).agentId).toBe(ids.agentA);

      const [updated] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.openIncident));

      expect(updated).toMatchObject({
        agentId: ids.agentA,
        status: 'open',
      });

      expect(await eventsOf(ids.openIncident)).toContainEqual(
        expect.objectContaining({
          fromStatus: 'open',
          toStatus: 'open',
          actor: 'agent',
          actorId: ids.agentA,
          reason: 'Incident assigned to agent',
        }),
      );
    });

    it('rejects assigning an incident owned by another agent', async () => {
      const eventsBefore = await eventsOf(ids.escalatedIncident);

      const response = await assign(ids.escalatedIncident).expect(409);

      expectError(response.body, 'CONFLICT');

      const [unchanged] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.escalatedIncident));

      expect(unchanged?.agentId).toBe(ids.agentB);
      expect(await eventsOf(ids.escalatedIncident)).toEqual(eventsBefore);
    });

    it('rejects assigning a resolved incident', async () => {
      const eventsBefore = await eventsOf(ids.resolvedIncident);

      const response = await assign(ids.resolvedIncident).expect(409);

      expectError(response.body, 'CONFLICT');

      const [unchanged] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.resolvedIncident));

      expect(unchanged?.agentId).toBe(ids.agentA);
      expect(unchanged?.status).toBe('resolved');
      expect(await eventsOf(ids.resolvedIncident)).toEqual(eventsBefore);
    });

    it('does not duplicate the assignment event when assigned again by the same agent', async () => {
      await assign(ids.openIncident).expect(201);
      const eventsAfterFirstAssignment = await eventsOf(ids.openIncident);

      await assign(ids.openIncident).expect(201);

      expect(await eventsOf(ids.openIncident)).toEqual(eventsAfterFirstAssignment);
    });

    it('rejects customers', async () => {
      await assign(ids.openIncident, cookie.ana).expect(403);
    });

    it('returns 404 for a missing incident', async () => {
      await assign(ids.missing).expect(404);
    });
  });

  describe('POST /incidents/:id/notify-driver', () => {
    const notify = (id: string, who: string = cookie.agentA) =>
      http().post(`/incidents/${id}/notify-driver`).set('Cookie', who);

    it('sends a localized SMS, records the communication and transitions to notified', async () => {
      const response = await notify(ids.openIncident).expect(201);

      expect(incidentSchema.parse(response.body).status).toBe('notified');

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
      expect(testApp.vonage.callsTo('sendSms')[0]).toMatchObject({
        to: '+34600000009',
        text: expect.stringContaining('incidencia en el pedido'),
      });

      const [communication] = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, ids.openIncident));

      expect(communication).toMatchObject({
        channel: 'sms',
        direction: 'outbound',
        toNumber: '+34600000009',
        vonageUuid: 'fake-sms-1',
        status: 'queued',
      });

      const events = await eventsOf(ids.openIncident);
      expect(events).toContainEqual(
        expect.objectContaining({
          fromStatus: 'open',
          toStatus: 'notified',
          actor: 'agent',
          actorId: ids.agentA,
          reason: 'Driver notified by SMS',
        }),
      );
    });

    it('rejects customers without sending an SMS', async () => {
      await notify(ids.openIncident, cookie.ana).expect(403);

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(0);
    });

    it('rejects an incident that has already been notified', async () => {
      await notify(ids.notifiedIncident).expect(409);

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(0);
    });

    it('marks the communication failed when Vonage definitively rejects the SMS', async () => {
      const eventsBefore = await eventsOf(ids.openIncident);
      testApp.vonage.failNext(
        'sendSms',
        new VonageRequestError('sendSms', { status: 400 }),
      );

      await notify(ids.openIncident).expect(502);

      const rows = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, ids.openIncident));
      const [incident] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.openIncident));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'failed', vonageUuid: null });
      expect(incident?.status).toBe('open');
      expect(await eventsOf(ids.openIncident)).toHaveLength(eventsBefore.length);
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
    });

    it('keeps the communication pending when the SMS result is uncertain', async () => {
      const eventsBefore = await eventsOf(ids.openIncident);
      testApp.vonage.failNext('sendSms', new Error('Network connection lost'));

      await notify(ids.openIncident).expect(500);

      const rows = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, ids.openIncident));
      const [incident] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.openIncident));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'pending', vonageUuid: null });
      expect(incident?.status).toBe('open');
      expect(await eventsOf(ids.openIncident)).toHaveLength(eventsBefore.length);
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
    });

    it('does not send a second SMS when two agents notify concurrently', async () => {
      const responses = await Promise.all([notify(ids.openIncident), notify(ids.openIncident)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);

      const communicationsForIncident = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, ids.openIncident));

      expect(communicationsForIncident).toHaveLength(1);
    });
  });

  describe('PATCH /incidents/:id/status', () => {
    const patch = (id: string, body: object, who: string = cookie.agentA) =>
      http().patch(`/incidents/${id}/status`).set('Cookie', who).send(body);

    it('changes the status and records the event in the same transaction', async () => {
      const response = await patch(ids.openIncident, {
        status: 'escalated',
        reason: 'Customer called twice',
      }).expect(200);

      const incident = incidentSchema.parse(response.body);
      const [row] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.openIncident));

      expect(incident.status).toBe('escalated');
      expect(Date.parse(incident.updatedAt)).toBeGreaterThan(times.openUpdated.getTime());
      expect(row?.status).toBe('escalated');
      expect(await eventsOf(ids.openIncident)).toEqual([
        expect.objectContaining({
          fromStatus: 'open',
          toStatus: 'escalated',
          actor: 'agent',
          actorId: ids.agentA,
          reason: 'Customer called twice',
        }),
      ]);
    });

    it('closes the incident with the reason as resolution when it is resolved', async () => {
      const response = await patch(ids.escalatedIncident, {
        status: 'resolved',
        reason: 'Refund issued',
      }).expect(200);

      const incident = incidentSchema.parse(response.body);
      const [event] = await eventsOf(ids.escalatedIncident);

      expect(incident).toMatchObject({ status: 'resolved', resolution: 'Refund issued' });
      expect(incident.closedAt).toBe(event?.occurredAt.toISOString());
    });

    it('returns 409 for a transition the state machine does not allow, and changes nothing', async () => {
      const response = await patch(ids.resolvedIncident, { status: 'escalated' }).expect(409);

      expectError(response.body, 'INVALID_TRANSITION');
      expect(await eventsOf(ids.resolvedIncident)).toEqual([]);

      const [row] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.resolvedIncident));

      expect(row?.status).toBe('resolved');
    });

    it('returns 409 for a transition the actor may not perform', async () => {
      const response = await patch(ids.openIncident, { status: 'notified' }).expect(409);

      expectError(response.body, 'TRANSITION_NOT_ALLOWED_FOR_ACTOR');
      expect(await eventsOf(ids.openIncident)).toEqual([]);
    });

    it('waits for a concurrent change and applies the transition to its result', async () => {
      const { pending } = await testApp.db.transaction(async (tx) => {
        await tx
          .update(incidents)
          .set({ status: 'escalated' })
          .where(eq(incidents.id, ids.openIncident));

        const pendingResponse = patch(ids.openIncident, { status: 'escalated' }).then(
          (response) => response,
        );

        await waitForLockWait(testApp.db);

        return { pending: pendingResponse };
      });

      const response = await pending;

      expect(response.status).toBe(409);
      expectError(response.body, 'INVALID_TRANSITION');
      expect(await eventsOf(ids.openIncident)).toEqual([]);
    });

    it('returns 400 for an unknown status or an empty reason', async () => {
      const unknown = await patch(ids.openIncident, { status: 'closed' }).expect(400);
      const emptyReason = await patch(ids.openIncident, {
        status: 'escalated',
        reason: '   ',
      }).expect(400);

      expect((unknown.body as ApiErrorResponse).error.details?.[0]?.path).toBe('status');
      expect((emptyReason.body as ApiErrorResponse).error.details?.[0]?.path).toBe('reason');
    });

    it('returns 404 for a missing incident', async () => {
      expectError(
        (await patch(ids.missing, { status: 'escalated' }).expect(404)).body,
        'NOT_FOUND',
      );
    });

    it('returns 403 for customers, who cannot change the status', async () => {
      expectError(
        (await patch(ids.openIncident, { status: 'escalated' }, cookie.ana).expect(403)).body,
        'FORBIDDEN',
      );
    });
  });

  describe('POST /incidents/:id/notify-driver/again', () => {
    it.each([
      { label: 'missing', key: undefined },
      { label: 'empty', key: '' },
      { label: 'whitespace-only', key: '   ' },
      { label: 'oversized', key: 'x'.repeat(256) },
    ])('returns 400 for a $label idempotency key', async ({ key }) => {
      let request = http()
        .post(`/incidents/${ids.notifiedIncident}/notify-driver/again`)
        .set('Cookie', cookie.agentA);

      if (key !== undefined) {
        request = request.set('Idempotency-Key', key);
      }

      const response = await request.expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(0);
    });

    it('resends an SMS and records the communication and event', async () => {
      const response = await http()
        .post(`/incidents/${ids.notifiedIncident}/notify-driver/again`)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', 'incident-102-resend-1')
        .expect(201);

      expect(incidentSchema.parse(response.body).status).toBe('notified');
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
      expect(testApp.vonage.callsTo('sendSms')[0]).toMatchObject({
        to: '+34600000009',
        text: expect.stringContaining('incidencia en el pedido'),
      });

      const events = await eventsOf(ids.notifiedIncident);
      expect(events).toContainEqual(
        expect.objectContaining({
          fromStatus: 'notified',
          toStatus: 'notified',
          actor: 'agent',
          actorId: ids.agentA,
          reason: 'Driver notification resent',
        }),
      );
    });

    it('marks a resent communication failed when Vonage definitively rejects the SMS', async () => {
      const eventsBefore = await eventsOf(ids.notifiedIncident);
      testApp.vonage.failNext(
        'sendSms',
        new VonageRequestError('sendSms', { status: 400 }),
      );

      await http()
        .post(`/incidents/${ids.notifiedIncident}/notify-driver/again`)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', 'incident-102-resend-definite-failure')
        .expect(502);

      const rows = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, ids.notifiedIncident));
      const [incident] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.notifiedIncident));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'failed', vonageUuid: null });
      expect(incident?.status).toBe('notified');
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(eventsBefore.length);
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
    });

    it('keeps a resent communication pending when the SMS result is uncertain', async () => {
      const eventsBefore = await eventsOf(ids.notifiedIncident);
      testApp.vonage.failNext('sendSms', new Error('Network connection lost'));

      await http()
        .post(`/incidents/${ids.notifiedIncident}/notify-driver/again`)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', 'incident-102-resend-uncertain-failure')
        .expect(500);

      const rows = await testApp.db
        .select()
        .from(communications)
        .where(eq(communications.incidentId, ids.notifiedIncident));
      const [incident] = await testApp.db
        .select()
        .from(incidents)
        .where(eq(incidents.id, ids.notifiedIncident));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'pending', vonageUuid: null });
      expect(incident?.status).toBe('notified');
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(eventsBefore.length);
      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
    });

    it('does not send or record a duplicate when the same key is retried', async () => {
      const path = `/incidents/${ids.notifiedIncident}/notify-driver/again`;

      await http()
        .post(path)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', 'incident-102-resend-retry')
        .expect(201);

      const eventsAfterFirstRequest = await eventsOf(ids.notifiedIncident);

      await http()
        .post(path)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', 'incident-102-resend-retry')
        .expect(201);

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(eventsAfterFirstRequest.length);
    });

    it('allows a deliberate resend with a different key', async () => {
      const path = `/incidents/${ids.notifiedIncident}/notify-driver/again`;

      for (const key of ['incident-102-resend-a', 'incident-102-resend-b']) {
        await http()
          .post(path)
          .set('Cookie', cookie.agentA)
          .set('Idempotency-Key', key)
          .expect(201);
      }

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(2);
      expect(await eventsOf(ids.notifiedIncident)).toHaveLength(2);
    });

    it('rejects an idempotency key already used by another incident', async () => {
      const key = 'incident-resend-cross-incident';

      await http()
        .post(`/incidents/${ids.notifiedIncident}/notify-driver/again`)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', key)
        .expect(201);

      await http()
        .post(`/incidents/${ids.openIncident}/notify-driver/again`)
        .set('Cookie', cookie.agentA)
        .set('Idempotency-Key', key)
        .expect(409);

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(1);
    });
    it('rejects customers', async () => {
      await http()
        .post(`/incidents/${ids.notifiedIncident}/notify-driver/again`)
        .set('Cookie', cookie.ana)
        .set('Idempotency-Key', 'incident-102-customer')
        .expect(403);

      expect(testApp.vonage.callsTo('sendSms')).toHaveLength(0);
    });
  });

  describe('error shape', () => {
    it('uses the API error shape for unknown routes', async () => {
      const response = await http().get('/does-not-exist').expect(404);

      expectError(response.body, 'NOT_FOUND');
    });
  });
});

import {
  apiErrorResponseSchema,
  incidentDetailSchema,
  incidentSchema,
  listIncidentsResponseSchema,
} from '@csl/contracts';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { incidentEvents, incidents } from '../src/database/schema/index.js';

import { createTestApp, resetDatabase, waitForLockWait } from './fixtures/app.js';
import { actor, ids, seed, times } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse, ListIncidentsResponse } from '@csl/contracts';

const DEV_ACTOR = 'X-Dev-Actor';

describe('Incidents (e2e)', () => {
  let testApp: TestApp;

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
    await resetDatabase(testApp.db);
    await seed(testApp.db);
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  describe('POST /incidents', () => {
    it('creates an incident for the customer’s order and records the initial event', async () => {
      const response = await http()
        .post('/incidents')
        .set(DEV_ACTOR, actor.ana)
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
        .set(DEV_ACTOR, actor.ana)
        .send({ orderId: ids.brunoOrder, type: 'damaged' })
        .expect(404);

      expectError(response.body, 'NOT_FOUND');
      expect(response.body).toEqual(
        (
          await http()
            .post('/incidents')
            .set(DEV_ACTOR, actor.ana)
            .send({ orderId: ids.missing, type: 'damaged' })
            .expect(404)
        ).body,
      );
    });

    it('returns 400 with the offending fields', async () => {
      const response = await http()
        .post('/incidents')
        .set(DEV_ACTOR, actor.ana)
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
        .set(DEV_ACTOR, actor.ana)
        .set('Content-Type', 'application/json')
        .send('{"orderId":')
        .expect(400);

      expectError(response.body, 'BAD_REQUEST');
    });

    it('returns 403 for agents', async () => {
      const response = await http()
        .post('/incidents')
        .set(DEV_ACTOR, actor.agentA)
        .send({ orderId: ids.anaOrder, type: 'damaged' })
        .expect(403);

      expectError(response.body, 'FORBIDDEN');
    });

    it('returns 401 without the dev actor header', async () => {
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
        .set(DEV_ACTOR, actor.agentA)
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

    it('counts every incident that matches, not only the ones in the page', async () => {
      const page = await list('q=ana&limit=1');

      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(3);
      expect(page.statusCounts).toEqual({
        open: 1,
        notified: 1,
        in_mediation: 1,
        resolved: 0,
        escalated: 0,
      });
    });

    it('does not count an incident twice when a status is repeated', async () => {
      expect((await list('status=open&status=open')).total).toBe(1);
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
        .set(DEV_ACTOR, actor.agentA)
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
        .set(DEV_ACTOR, actor.agentA)
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
        .set(DEV_ACTOR, actor.agentA)
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
      await http().get(`/incidents/${ids.openIncident}`).set(DEV_ACTOR, actor.ana).expect(200);
    });

    it('returns the same 404 for another customer’s incident and for a missing one', async () => {
      const notYours = await http()
        .get(`/incidents/${ids.openIncident}`)
        .set(DEV_ACTOR, actor.bruno)
        .expect(404);
      const missing = await http()
        .get(`/incidents/${ids.missing}`)
        .set(DEV_ACTOR, actor.agentA)
        .expect(404);

      expectError(notYours.body, 'NOT_FOUND');
      expect(notYours.body).toEqual(missing.body);
    });

    it('returns 400 for an id that is not a UUID', async () => {
      const response = await http()
        .get('/incidents/not-a-uuid')
        .set(DEV_ACTOR, actor.agentA)
        .expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
    });
  });

  describe('PATCH /incidents/:id/status', () => {
    const patch = (id: string, body: object, who: string = actor.agentA) =>
      http().patch(`/incidents/${id}/status`).set(DEV_ACTOR, who).send(body);

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

    it('returns 404 for a missing incident and for another customer’s incident', async () => {
      expectError(
        (await patch(ids.missing, { status: 'escalated' }).expect(404)).body,
        'NOT_FOUND',
      );
      expectError(
        (await patch(ids.openIncident, { status: 'escalated' }, actor.stranger).expect(404)).body,
        'NOT_FOUND',
      );
    });
  });

  describe('error shape', () => {
    it('uses the API error shape for unknown routes', async () => {
      const response = await http().get('/does-not-exist').expect(404);

      expectError(response.body, 'NOT_FOUND');
    });
  });
});

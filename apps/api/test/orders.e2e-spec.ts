import { apiErrorResponseSchema, listOrdersResponseSchema } from '@csl/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { actor, ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';

describe('Orders (e2e)', () => {
  let testApp: TestApp;

  const http = () => request(testApp.app.getHttpServer());

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

  it('returns only the customer’s orders, newest first', async () => {
    const response = await http().get('/orders').set('X-Dev-Actor', actor.ana).expect(200);

    expect(listOrdersResponseSchema.parse(response.body)).toEqual({
      items: [
        {
          id: ids.anaOrder,
          customerId: ids.ana,
          routeId: null,
          address: 'Calle Mayor 1',
          status: 'pending',
        },
        {
          id: ids.anaRoutedOrder,
          customerId: ids.ana,
          routeId: ids.route,
          address: 'Calle Mayor 1',
          status: 'failed',
        },
      ],
    });
  });

  it('returns an empty list for a customer without orders', async () => {
    await http().get('/orders').set('X-Dev-Actor', actor.stranger).expect(200, { items: [] });
  });

  it('returns 403 for agents', async () => {
    const response = await http().get('/orders').set('X-Dev-Actor', actor.agentA).expect(403);

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('FORBIDDEN');
  });

  it('returns 401 with an invalid dev actor header', async () => {
    const response = await http().get('/orders').set('X-Dev-Actor', 'customer:nope').expect(401);

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED');
  });
});

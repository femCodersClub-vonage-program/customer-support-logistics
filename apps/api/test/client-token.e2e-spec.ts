import { apiErrorResponseSchema, clientTokenResponseSchema } from '@csl/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { VonageRequestError } from '../src/vonage/vonage.errors.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookiesFor } from './fixtures/auth.js';
import { actor, ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse } from '@csl/contracts';

describe('Vonage client token (e2e)', () => {
  let testApp: TestApp;
  let cookie: Record<keyof typeof actor, string>;

  const http = () => request(testApp.app.getHttpServer());

  const createToken = (body: unknown, as?: string) => {
    const pending = http()
      .post('/vonage/client-token')
      .send(body as object);

    return as === undefined ? pending : pending.set('Cookie', as);
  };

  const expectError = (body: unknown, code: ApiErrorResponse['error']['code']) => {
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(code);
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

  it('gives the owner of an incident in mediation a token for their Vonage user', async () => {
    const response = await createToken({ incidentId: ids.mediationIncident }, cookie.ana).expect(
      201,
    );

    const body = clientTokenResponseSchema.parse(response.body);
    const userName = `cust-${ids.ana}`;

    expect(body).toEqual({
      token: `fake-client-token-${userName}`,
      userName,
      expiresAt: expect.any(String),
    });
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(testApp.vonage.calls).toEqual([
      { operation: 'ensureUser', name: userName },
      { operation: 'createClientToken', userName },
    ]);
  });

  it('gives an agent a token for any incident in mediation', async () => {
    const response = await createToken({ incidentId: ids.mediationIncident }, cookie.agentA).expect(
      201,
    );

    expect(clientTokenResponseSchema.parse(response.body).userName).toBe(`agent-${ids.agentA}`);
  });

  it('does not give a token to a customer who does not own the incident', async () => {
    const response = await createToken({ incidentId: ids.mediationIncident }, cookie.bruno).expect(
      404,
    );

    expectError(response.body, 'NOT_FOUND');
    expect(testApp.vonage.calls).toEqual([]);
  });

  it('answers 404 for an incident that does not exist', async () => {
    const response = await createToken({ incidentId: ids.missing }, cookie.agentA).expect(404);

    expectError(response.body, 'NOT_FOUND');
  });

  it('answers 409 when the incident is not in mediation', async () => {
    const response = await createToken({ incidentId: ids.notifiedIncident }, cookie.ana).expect(
      409,
    );

    expectError(response.body, 'CONFLICT');
    expect(testApp.vonage.calls).toEqual([]);
  });

  it('rejects a body without a valid incident id', async () => {
    const response = await createToken({ incidentId: 'not-a-uuid' }, cookie.ana).expect(400);

    expectError(response.body, 'VALIDATION_FAILED');
  });

  it('needs a session', async () => {
    const response = await createToken({ incidentId: ids.mediationIncident }).expect(401);

    expectError(response.body, 'UNAUTHORIZED');
  });

  it('answers 502 when Vonage cannot create the user', async () => {
    testApp.vonage.failNext(
      'ensureUser',
      new VonageRequestError('ensureUser', { status: 500, reason: 'Server error' }),
    );

    const response = await createToken({ incidentId: ids.mediationIncident }, cookie.ana).expect(
      502,
    );

    expectError(response.body, 'BAD_GATEWAY');
    expect(testApp.vonage.callsTo('createClientToken')).toEqual([]);
  });
});

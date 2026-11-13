import { apiErrorResponseSchema, currentUserSchema } from '@csl/contracts';
import { ThrottlerStorageService, getStorageToken } from '@nestjs/throttler';
import { eq, lte, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AGENT_LOGIN_ATTEMPTS_PER_MINUTE } from '../src/auth/auth.controller.js';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_LIFETIME_MS } from '../src/auth/sessions.service.js';
import { agents, sessions } from '../src/database/schema/index.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookieFor } from './fixtures/auth.js';
import { ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse } from '@csl/contracts';
import type { ThrottlerStorage } from '@nestjs/throttler';

const AGENT_EMAIL = 'agent.a@example.com';
const AGENT_PASSWORD = 'a long and correct password';

describe('Auth (e2e)', () => {
  let testApp: TestApp;

  const http = () => request(testApp.app.getHttpServer());

  const login = (email: string, password: string) =>
    http().post('/auth/agent/login').send({ email, password });

  const sessionCookieFrom = (response: request.Response) => {
    const header = response.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = header?.find((value) => value.startsWith('csl_session='));

    if (!cookie) {
      throw new Error('The response did not set the session cookie');
    }

    return cookie;
  };

  const expectError = (body: unknown, code: ApiErrorResponse['error']['code']) => {
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(code);
  };

  let throttlerStorage = new ThrottlerStorageService();

  const freshEveryTest: ThrottlerStorage = {
    increment: (...args) => throttlerStorage.increment(...args),
  };

  beforeAll(async () => {
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(getStorageToken()).useValue(freshEveryTest),
    );
  });

  beforeEach(async () => {
    throttlerStorage.onApplicationShutdown();
    throttlerStorage = new ThrottlerStorageService();
    await resetDatabase(testApp.db);
    await seed(testApp.db);
    await testApp.db
      .update(agents)
      .set({ passwordHash: await hashPassword(AGENT_PASSWORD) })
      .where(eq(agents.id, ids.agentA));
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  describe('POST /auth/agent/login', () => {
    it('logs the agent in and sets a session cookie that JavaScript cannot read', async () => {
      const response = await login(AGENT_EMAIL, AGENT_PASSWORD).expect(200);

      expect(currentUserSchema.parse(response.body)).toEqual({
        role: 'agent',
        id: ids.agentA,
        name: 'Agent A',
      });

      const cookie = sessionCookieFrom(response);

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain(`Max-Age=${SESSION_LIFETIME_MS.agent / 1000}`);
    });

    it('stores only a hash of the token', async () => {
      const cookie = sessionCookieFrom(await login(AGENT_EMAIL, AGENT_PASSWORD).expect(200));
      const token = cookie.split(';')[0]?.split('=')[1];
      const rows = await testApp.db.select().from(sessions);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).not.toBe(token);
    });

    it('opens the agent routes with the cookie it sets', async () => {
      const cookie = sessionCookieFrom(await login(AGENT_EMAIL, AGENT_PASSWORD).expect(200));

      await http().get('/incidents').set('Cookie', cookie).expect(200);
    });

    it('accepts the email in any case and with spaces around it', async () => {
      await login('  Agent.A@Example.COM ', AGENT_PASSWORD).expect(200);
    });

    it('gives the same 401 for a wrong password, an unknown email and an agent without password', async () => {
      const wrongPassword = await login(AGENT_EMAIL, 'not the password').expect(401);
      const unknownEmail = await login('nobody@example.com', AGENT_PASSWORD).expect(401);
      const withoutPassword = await login('agent.b@example.com', AGENT_PASSWORD).expect(401);

      expectError(wrongPassword.body, 'UNAUTHORIZED');
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(withoutPassword.body).toEqual(wrongPassword.body);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('answers 429 after too many attempts from the same IP', async () => {
      for (let attempt = 0; attempt < AGENT_LOGIN_ATTEMPTS_PER_MINUTE; attempt += 1) {
        await login(AGENT_EMAIL, 'not the password').expect(401);
      }

      expectError((await login(AGENT_EMAIL, AGENT_PASSWORD).expect(429)).body, 'RATE_LIMITED');
    });

    it('ends the session the request already carried', async () => {
      const first = sessionCookieFrom(await login(AGENT_EMAIL, AGENT_PASSWORD).expect(200));
      const second = sessionCookieFrom(
        await login(AGENT_EMAIL, AGENT_PASSWORD).set('Cookie', first).expect(200),
      );

      await http().get('/auth/me').set('Cookie', first).expect(401);
      await http().get('/auth/me').set('Cookie', second).expect(200);
    });

    it('deletes expired sessions when someone logs in', async () => {
      await sessionCookieFor(testApp, { role: 'customer', id: ids.ana });
      await testApp.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });

      await login(AGENT_EMAIL, AGENT_PASSWORD).expect(200);

      expect(
        await testApp.db
          .select()
          .from(sessions)
          .where(lte(sessions.expiresAt, sql`now()`)),
      ).toEqual([]);
    });

    it('returns 400 with the offending fields', async () => {
      const response = await login('not-an-email', '').expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
      expect(
        (response.body as ApiErrorResponse).error.details?.map(({ path }) => path).sort(),
      ).toEqual(['email', 'password']);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the customer behind a customer session', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'customer', id: ids.ana });
      const response = await http().get('/auth/me').set('Cookie', cookie).expect(200);

      expect(currentUserSchema.parse(response.body)).toEqual({
        role: 'customer',
        id: ids.ana,
        name: 'Ana García',
      });
    });

    it('returns 401 without a session', async () => {
      expectError((await http().get('/auth/me').expect(401)).body, 'UNAUTHORIZED');
    });
  });

  describe('POST /auth/logout', () => {
    it('ends the session, so the same cookie no longer works, and clears the cookie', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'agent', id: ids.agentA });

      const response = await http().post('/auth/logout').set('Cookie', cookie).expect(204);

      expect(sessionCookieFrom(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
      await http().get('/auth/me').set('Cookie', cookie).expect(401);
      expect(await testApp.db.select().from(sessions)).toEqual([]);
    });

    it('answers 204 without a session', async () => {
      await http().post('/auth/logout').expect(204);
    });
  });

  describe('sessions on protected routes', () => {
    it('returns 401 without a session', async () => {
      expectError((await http().get('/orders').expect(401)).body, 'UNAUTHORIZED');
      expectError((await http().get('/incidents').expect(401)).body, 'UNAUTHORIZED');
    });

    it('returns 401 for an unknown token', async () => {
      await http().get('/auth/me').set('Cookie', 'csl_session=made-up-token').expect(401);
    });

    it('returns 401 once the session has expired', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'customer', id: ids.ana });
      await testApp.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });

      await http().get('/orders').set('Cookie', cookie).expect(401);
    });

    it('returns 403 when a customer calls an agent route', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'customer', id: ids.ana });

      expectError(
        (await http().get('/incidents').set('Cookie', cookie).expect(403)).body,
        'FORBIDDEN',
      );
      await http()
        .patch(`/incidents/${ids.openIncident}/status`)
        .set('Cookie', cookie)
        .send({ status: 'escalated' })
        .expect(403);
    });

    it('returns 403 when an agent calls a customer route', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'agent', id: ids.agentA });

      await http().get('/orders').set('Cookie', cookie).expect(403);
    });

    it('returns 404 when a customer reads another customer’s incident', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'customer', id: ids.bruno });

      expectError(
        (await http().get(`/incidents/${ids.openIncident}`).set('Cookie', cookie).expect(404)).body,
        'NOT_FOUND',
      );
    });

    it('lets a customer read their own incident', async () => {
      const cookie = await sessionCookieFor(testApp, { role: 'customer', id: ids.ana });

      await http().get(`/incidents/${ids.openIncident}`).set('Cookie', cookie).expect(200);
    });
  });

  describe('public routes', () => {
    it('serves /health without a session', async () => {
      await http().get('/health').expect(200);
    });
  });
});

import { apiErrorResponseSchema, currentUserSchema } from '@csl/contracts';
import { ThrottlerStorageService, getStorageToken } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CUSTOMER_LOGIN_CHECKS_PER_MINUTE,
  CUSTOMER_LOGIN_STARTS_PER_WINDOW,
} from '../src/auth/auth.controller.js';
import { SESSION_COOKIE, VERIFICATION_COOKIE } from '../src/auth/session-cookie.js';
import { customers } from '../src/database/schema/index.js';
import { VonageRequestError } from '../src/vonage/vonage.errors.js';
import { VERIFICATION_MAX_WRONG_CODES } from '../src/vonage/vonage.service.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { sessionCookieFor } from './fixtures/auth.js';
import { FAKE_VERIFICATION_CODE } from './fixtures/fake-vonage.service.js';
import { ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse } from '@csl/contracts';
import type { ThrottlerStorage } from '@nestjs/throttler';

const ANA_PHONE = '+34600000001';
const BRUNO_PHONE = '+34600000002';
const UNKNOWN_PHONE = '+34699999999';

describe('Customer login (e2e)', () => {
  let testApp: TestApp;
  let throttlerStorage = new ThrottlerStorageService();

  const freshEveryTest: ThrottlerStorage = {
    increment: (...args) => throttlerStorage.increment(...args),
  };

  const http = () => request(testApp.app.getHttpServer());

  const cookiesOf = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

  const cookieNamed = (response: request.Response, name: string) =>
    cookiesOf(response).find((cookie) => cookie.startsWith(`${name}=`));

  const pairOf = (cookie: string | undefined) => cookie?.split(';')[0] ?? '';

  const start = (phone: string) => http().post('/auth/customer/start').send({ phone });

  const startAndKeepCookie = async (phone: string) =>
    pairOf(cookieNamed(await start(phone).expect(200), VERIFICATION_COOKIE));

  const check = (code: string, cookie?: string) => {
    const call = http().post('/auth/customer/check').send({ code });

    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  const expectError = (body: unknown, code: ApiErrorResponse['error']['code']) => {
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(code);
  };

  const customerRow = async (id: string) => {
    const [row] = await testApp.db.select().from(customers).where(eq(customers.id, id));

    return row!;
  };

  beforeAll(async () => {
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(getStorageToken()).useValue(freshEveryTest),
    );
  });

  beforeEach(async () => {
    throttlerStorage = new ThrottlerStorageService();
    testApp.vonage.reset();
    await resetDatabase(testApp.db);
    await seed(testApp.db);
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  describe('POST /auth/customer/start', () => {
    it('starts a Verify request in the customer locale and keeps its id in an HttpOnly cookie', async () => {
      const response = await start(BRUNO_PHONE).expect(200);

      expect(response.body).toEqual({ channel: 'sms' });
      expect(testApp.vonage.callsTo('startVerification')).toEqual([
        { operation: 'startVerification', phone: BRUNO_PHONE, locale: 'en' },
      ]);

      const cookie = cookieNamed(response, VERIFICATION_COOKIE);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Lax/);
    });

    it('gives an unknown phone the same answer without calling Vonage', async () => {
      const response = await start(UNKNOWN_PHONE).expect(200);

      expect(response.body).toEqual({ channel: 'sms' });
      expect(cookieNamed(response, VERIFICATION_COOKIE)).toBeDefined();
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 400 for a phone that is not E.164', async () => {
      const response = await start('600000001').expect(400);

      expectError(response.body, 'VALIDATION_FAILED');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 429 when Verify blocks the number', async () => {
      testApp.vonage.blockNextStart();

      const response = await start(ANA_PHONE).expect(429);

      expectError(response.body, 'RATE_LIMITED');
      expect(cookieNamed(response, VERIFICATION_COOKIE)).toBeUndefined();
    });

    it('returns 502 when Vonage fails', async () => {
      testApp.vonage.failNext('startVerification', new VonageRequestError('startVerification'));

      expectError((await start(ANA_PHONE).expect(502)).body, 'BAD_GATEWAY');
    });

    it('answers 429 after too many starts', async () => {
      for (let attempt = 0; attempt < CUSTOMER_LOGIN_STARTS_PER_WINDOW; attempt += 1) {
        await start(UNKNOWN_PHONE).expect(200);
      }

      expectError((await start(UNKNOWN_PHONE).expect(429)).body, 'RATE_LIMITED');
    });
  });

  describe('POST /auth/customer/check', () => {
    it('logs the customer in with the right code and marks the phone as verified', async () => {
      const verification = await startAndKeepCookie(BRUNO_PHONE);

      const response = await check(FAKE_VERIFICATION_CODE, verification).expect(200);

      expect(currentUserSchema.parse(response.body)).toEqual({
        role: 'customer',
        id: ids.bruno,
        name: 'Bruno Díaz',
      });
      expect(cookieNamed(response, SESSION_COOKIE)).toMatch(/HttpOnly/);
      expect(cookieNamed(response, VERIFICATION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await customerRow(ids.bruno)).phoneVerifiedAt).toBeInstanceOf(Date);

      const session = pairOf(cookieNamed(response, SESSION_COOKIE));
      await http().get('/auth/me').set('Cookie', session).expect(200, response.body);
      await http().get('/orders').set('Cookie', session).expect(200);
    });

    it('checks the code against the request id in the cookie', async () => {
      const verification = await startAndKeepCookie(BRUNO_PHONE);

      await check(FAKE_VERIFICATION_CODE, verification).expect(200);

      expect(testApp.vonage.callsTo('checkVerification')).toEqual([
        {
          operation: 'checkVerification',
          requestId: verification.split('=')[1],
          code: FAKE_VERIFICATION_CODE,
        },
      ]);
    });

    it('returns 401 for a wrong code and lets the customer try again', async () => {
      const verification = await startAndKeepCookie(ANA_PHONE);

      expectError((await check('0000', verification).expect(401)).body, 'INVALID_CODE');
      await check(FAKE_VERIFICATION_CODE, verification).expect(200);
    });

    it('rejects every code for an unknown phone as wrong, without calling Vonage', async () => {
      const verification = await startAndKeepCookie(UNKNOWN_PHONE);

      const response = await check(FAKE_VERIFICATION_CODE, verification).expect(401);

      expectError(response.body, 'INVALID_CODE');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('ends an unknown phone on the third wrong code, as Verify ends a real one', async () => {
      const verification = await startAndKeepCookie(UNKNOWN_PHONE);

      for (let attempt = 1; attempt < VERIFICATION_MAX_WRONG_CODES; attempt += 1) {
        expectError((await check('0000', verification).expect(401)).body, 'INVALID_CODE');
      }

      expectError((await check('0000', verification).expect(410)).body, 'TOO_MANY_ATTEMPTS');
      expectError((await check('0000', verification).expect(410)).body, 'VERIFICATION_EXPIRED');
    });

    it('returns 410 without the verification cookie', async () => {
      const response = await check(FAKE_VERIFICATION_CODE).expect(410);

      expectError(response.body, 'VERIFICATION_EXPIRED');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('returns 410 for a request id the API did not start', async () => {
      const response = await check(FAKE_VERIFICATION_CODE, `${VERIFICATION_COOKIE}=forged`).expect(
        410,
      );

      expectError(response.body, 'VERIFICATION_EXPIRED');
      expect(testApp.vonage.calls).toEqual([]);
    });

    it.each([
      ['expired', 'VERIFICATION_EXPIRED'],
      ['too_many_attempts', 'TOO_MANY_ATTEMPTS'],
    ] as const)(
      'returns 410 when Verify answers %s, and forgets the request',
      async (outcome, code) => {
        const verification = await startAndKeepCookie(ANA_PHONE);
        testApp.vonage.answerNextCheck(outcome);

        expectError((await check(FAKE_VERIFICATION_CODE, verification).expect(410)).body, code);
        expectError(
          (await check(FAKE_VERIFICATION_CODE, verification).expect(410)).body,
          'VERIFICATION_EXPIRED',
        );
      },
    );

    it('returns 429 when Verify rate limits the check, and keeps the request', async () => {
      const verification = await startAndKeepCookie(ANA_PHONE);
      testApp.vonage.answerNextCheck('blocked');

      expectError(
        (await check(FAKE_VERIFICATION_CODE, verification).expect(429)).body,
        'RATE_LIMITED',
      );
      await check(FAKE_VERIFICATION_CODE, verification).expect(200);
    });

    it('does not accept the same verification twice', async () => {
      const verification = await startAndKeepCookie(ANA_PHONE);

      await check(FAKE_VERIFICATION_CODE, verification).expect(200);

      expectError(
        (await check(FAKE_VERIFICATION_CODE, verification).expect(410)).body,
        'VERIFICATION_EXPIRED',
      );
    });

    it('ends the session the request already carried', async () => {
      const previous = await sessionCookieFor(testApp, { role: 'customer', id: ids.ana });
      const verification = await startAndKeepCookie(ANA_PHONE);

      await check(FAKE_VERIFICATION_CODE, `${verification}; ${previous}`).expect(200);

      await http().get('/auth/me').set('Cookie', previous).expect(401);
    });

    it('returns 400 for a code that is not 4 to 10 letters or digits', async () => {
      expectError((await check('12', 'x=y').expect(400)).body, 'VALIDATION_FAILED');
    });

    it('answers 429 after too many checks from the same IP', async () => {
      const verification = await startAndKeepCookie(ANA_PHONE);

      for (let attempt = 0; attempt < CUSTOMER_LOGIN_CHECKS_PER_MINUTE; attempt += 1) {
        await check('0000', verification).expect(401);
      }

      expectError((await check('0000', verification).expect(429)).body, 'RATE_LIMITED');
    });
  });
});

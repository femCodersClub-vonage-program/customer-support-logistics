import { apiErrorResponseSchema } from '@csl/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SILENT_AUTH_REDIRECT_URL } from '../src/auth/customer-login.service.js';
import { VERIFICATION_COOKIE } from '../src/auth/session-cookie.js';

import { createTestApp, resetDatabase } from './fixtures/app.js';
import { FAKE_CHECK_URL, FAKE_VERIFICATION_CODE } from './fixtures/fake-vonage.service.js';
import { ids, seed } from './fixtures/seed.js';

import type { TestApp } from './fixtures/app.js';
import type { ApiErrorResponse } from '@csl/contracts';

const REDIRECT_URL = 'https://pwa.test/login/callback';
const ANA_PHONE = '+34600000001';
const UNKNOWN_PHONE = '+34699999999';

describe('Customer login with silent authentication (e2e)', () => {
  let testApp: TestApp;

  const http = () => request(testApp.app.getHttpServer());

  const verificationCookieOf = (response: request.Response) => {
    const cookies = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

    return (
      cookies.find((cookie) => cookie.startsWith(`${VERIFICATION_COOKIE}=`))?.split(';')[0] ?? ''
    );
  };

  const requestIdIn = (cookie: string) => cookie.split('=')[1] ?? '';

  const start = (phone: string) => http().post('/auth/customer/start').send({ phone });

  const expectError = (body: unknown, code: ApiErrorResponse['error']['code']) => {
    expect(apiErrorResponseSchema.parse(body).error.code).toBe(code);
  };

  beforeAll(async () => {
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(SILENT_AUTH_REDIRECT_URL).useValue(REDIRECT_URL),
    );
  });

  beforeEach(async () => {
    testApp.vonage.reset();
    await resetDatabase(testApp.db);
    await seed(testApp.db);
  });

  afterAll(async () => {
    await resetDatabase(testApp.db);
    await testApp.app.close();
  });

  it('returns the check URL and asks Verify for silent authentication with the PWA callback', async () => {
    const response = await start(ANA_PHONE).expect(200);
    const requestId = requestIdIn(verificationCookieOf(response));

    expect(response.body).toEqual({
      channel: 'silent_auth',
      checkUrl: `${FAKE_CHECK_URL}/${requestId}`,
    });
    expect(testApp.vonage.callsTo('startVerification')).toEqual([
      {
        operation: 'startVerification',
        phone: ANA_PHONE,
        locale: 'es',
        silentAuthRedirectUrl: REDIRECT_URL,
      },
    ]);
  });

  it('gives an unknown phone the SMS answer, without calling Vonage', async () => {
    expect((await start(UNKNOWN_PHONE).expect(200)).body).toEqual({ channel: 'sms' });
    expect(testApp.vonage.calls).toEqual([]);
  });

  it('logs in with the code and request id that come back from the redirect', async () => {
    const cookie = verificationCookieOf(await start(ANA_PHONE).expect(200));

    const response = await http()
      .post('/auth/customer/check')
      .set('Cookie', cookie)
      .send({ code: FAKE_VERIFICATION_CODE, requestId: requestIdIn(cookie) })
      .expect(200);

    expect(response.body).toMatchObject({ role: 'customer', id: ids.ana });
  });

  it('rejects a request id from the redirect that is not the one in the cookie', async () => {
    const cookie = verificationCookieOf(await start(ANA_PHONE).expect(200));

    const response = await http()
      .post('/auth/customer/check')
      .set('Cookie', cookie)
      .send({ code: FAKE_VERIFICATION_CODE, requestId: 'someone-else' })
      .expect(401);

    expectError(response.body, 'INVALID_CODE');
    expect(testApp.vonage.callsTo('checkVerification')).toEqual([]);
  });

  describe('POST /auth/customer/sms', () => {
    it('moves the request on to the SMS, and the SMS code logs in', async () => {
      const cookie = verificationCookieOf(await start(ANA_PHONE).expect(200));

      await http().post('/auth/customer/sms').set('Cookie', cookie).expect(204);

      expect(testApp.vonage.callsTo('moveVerificationToSms')).toEqual([
        { operation: 'moveVerificationToSms', requestId: requestIdIn(cookie) },
      ]);
      await http()
        .post('/auth/customer/check')
        .set('Cookie', cookie)
        .send({ code: FAKE_VERIFICATION_CODE })
        .expect(200);
    });

    it('returns 410 when Verify no longer has the request', async () => {
      const cookie = verificationCookieOf(await start(ANA_PHONE).expect(200));
      testApp.vonage.answerNextMoveToSms('expired');

      const response = await http().post('/auth/customer/sms').set('Cookie', cookie).expect(410);

      expectError(response.body, 'VERIFICATION_EXPIRED');
    });

    it('returns 410 without the verification cookie', async () => {
      expectError(
        (await http().post('/auth/customer/sms').expect(410)).body,
        'VERIFICATION_EXPIRED',
      );
      expect(testApp.vonage.calls).toEqual([]);
    });

    it('does nothing for an unknown phone', async () => {
      const cookie = verificationCookieOf(await start(UNKNOWN_PHONE).expect(200));

      await http().post('/auth/customer/sms').set('Cookie', cookie).expect(204);

      expect(testApp.vonage.calls).toEqual([]);
    });
  });
});

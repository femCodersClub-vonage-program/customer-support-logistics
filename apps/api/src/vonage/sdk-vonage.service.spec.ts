import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NEXT_WORKFLOW_ATTEMPTS, SdkVonageService, VERIFY_BRAND } from './sdk-vonage.service.js';
import { VonageRequestError, VonageTimeoutError } from './vonage.errors.js';

import type { NccoAction } from './ncco.js';
import type { VonageClient } from './vonage.client.js';

const VIRTUAL_NUMBER = '+34600000000';
const DRIVER_PHONE = '+34611000009';
const NCCO: NccoAction[] = [{ action: 'conversation', name: 'inc-1234' }];

function createClient() {
  return {
    messages: { send: vi.fn().mockResolvedValue({ messageUUID: 'msg-1' }) },
    voice: {
      createOutboundCall: vi.fn().mockResolvedValue({ uuid: 'call-1' }),
      transferCallWithNCCO: vi.fn().mockResolvedValue(undefined),
    },
    verify2: {
      newRequest: vi.fn().mockResolvedValue({ requestId: 'req-1' }),
      checkCode: vi.fn().mockResolvedValue('completed'),
      nextWorkflow: vi.fn().mockResolvedValue(true),
    },
  } satisfies VonageClient;
}

const API_SECRET = 'super-secret-value';

const REDIRECT_URL = 'https://pwa.example/login/callback';

function createService() {
  const client = createClient();
  return { client, service: new SdkVonageService(client, VIRTUAL_NUMBER, 50, 0) };
}

function httpError(status: number, body: Record<string, unknown>) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    name: 'VetchError',
    config: { headers: { Authorization: `Basic ${API_SECRET}` }, body: { to: DRIVER_PHONE } },
    response: new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  });
}

function abortError() {
  return new DOMException('This operation was aborted', 'AbortError');
}

describe('SdkVonageService', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function loggedLines(): string {
    return [...log.mock.calls, ...warn.mock.calls].map((args) => String(args[0])).join('\n');
  }

  describe('sendSms', () => {
    it('sends a Messages API SMS from the virtual number without the leading +', async () => {
      const { client, service } = createService();

      await expect(service.sendSms(DRIVER_PHONE, 'Hola')).resolves.toEqual({ messageId: 'msg-1' });
      expect(client.messages.send).toHaveBeenCalledWith({
        channel: 'sms',
        messageType: 'text',
        to: '34611000009',
        from: '34600000000',
        text: 'Hola',
      });
    });
  });

  describe('createCall', () => {
    it('calls the phone from the virtual number with the NCCO', async () => {
      const { client, service } = createService();

      await expect(service.createCall(DRIVER_PHONE, NCCO)).resolves.toEqual({ callId: 'call-1' });
      expect(client.voice.createOutboundCall).toHaveBeenCalledWith({
        to: [{ type: 'phone', number: '34611000009' }],
        from: { type: 'phone', number: '34600000000' },
        ncco: NCCO,
      });
    });
  });

  describe('transferCall', () => {
    it('transfers the call to the NCCO', async () => {
      const { client, service } = createService();

      await service.transferCall('call-1', NCCO);

      expect(client.voice.transferCallWithNCCO).toHaveBeenCalledWith('call-1', NCCO);
    });
  });

  describe('startVerification', () => {
    it('starts an SMS verification in the Verify locale of the user', async () => {
      const { client, service } = createService();

      await expect(service.startVerification(DRIVER_PHONE, 'es')).resolves.toEqual({
        status: 'started',
        requestId: 'req-1',
      });
      expect(client.verify2.newRequest).toHaveBeenCalledWith({
        brand: VERIFY_BRAND,
        locale: 'es-es',
        codeLength: 6,
        workflow: [{ channel: 'sms', to: '34611000009' }],
      });
    });

    it.each([
      [409, 'Conflict'],
      [429, 'Rate Limit Hit'],
    ])('is blocked when Vonage answers %i', async (status, title) => {
      const { client, service } = createService();
      client.verify2.newRequest.mockRejectedValue(httpError(status, { title }));

      await expect(service.startVerification(DRIVER_PHONE, 'es')).resolves.toEqual({
        status: 'blocked',
      });
    });
  });

  describe('startVerification with silent authentication', () => {
    it('tries silent authentication first, then SMS, and returns the check URL', async () => {
      const { client, service } = createService();
      client.verify2.newRequest.mockResolvedValue({ requestId: 'req-1', checkUrl: 'https://c' });

      await expect(service.startVerification(DRIVER_PHONE, 'es', REDIRECT_URL)).resolves.toEqual({
        status: 'started',
        requestId: 'req-1',
        checkUrl: 'https://c',
      });
      expect(client.verify2.newRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: [
            { channel: 'silent_auth', to: '34611000009', redirectUrl: REDIRECT_URL },
            { channel: 'sms', to: '34611000009' },
          ],
        }),
      );
    });

    it('starts again with SMS only when Vonage answers 412', async () => {
      const { client, service } = createService();
      client.verify2.newRequest
        .mockRejectedValueOnce(httpError(412, { title: 'Network not supported' }))
        .mockResolvedValueOnce({ requestId: 'req-2' });

      await expect(service.startVerification(DRIVER_PHONE, 'es', REDIRECT_URL)).resolves.toEqual({
        status: 'started',
        requestId: 'req-2',
      });
      expect(client.verify2.newRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ workflow: [{ channel: 'sms', to: '34611000009' }] }),
      );
    });
  });

  describe('startVerification with silent authentication, blocked', () => {
    it.each([409, 429])('stays blocked on %i instead of falling back to SMS', async (status) => {
      const { client, service } = createService();
      client.verify2.newRequest.mockRejectedValue(httpError(status, { title: 'Blocked' }));

      await expect(service.startVerification(DRIVER_PHONE, 'es', REDIRECT_URL)).resolves.toEqual({
        status: 'blocked',
      });
      expect(client.verify2.newRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('moveVerificationToSms', () => {
    it('does not try again after an error other than 409', async () => {
      const { client, service } = createService();
      client.verify2.nextWorkflow.mockRejectedValue(httpError(500, { title: 'Internal Error' }));

      await expect(service.moveVerificationToSms('req-1')).rejects.toMatchObject({ status: 500 });
      expect(client.verify2.nextWorkflow).toHaveBeenCalledTimes(1);
    });

    it('is expired after too many wrong codes (410)', async () => {
      const { client, service } = createService();
      client.verify2.nextWorkflow.mockRejectedValue(httpError(410, { title: 'Gone' }));

      await expect(service.moveVerificationToSms('req-1')).resolves.toBe('expired');
    });

    it('moves the request on to the SMS', async () => {
      const { client, service } = createService();

      await expect(service.moveVerificationToSms('req-1')).resolves.toBe('moved');
      expect(client.verify2.nextWorkflow).toHaveBeenCalledWith('req-1');
    });

    it('tries again while Vonage answers 409', async () => {
      const { client, service } = createService();
      client.verify2.nextWorkflow
        .mockRejectedValueOnce(httpError(409, { title: 'Conflict' }))
        .mockResolvedValueOnce(true);

      await expect(service.moveVerificationToSms('req-1')).resolves.toBe('moved');
      expect(client.verify2.nextWorkflow).toHaveBeenCalledTimes(2);
    });

    it(`fails after ${NEXT_WORKFLOW_ATTEMPTS} conflicts in a row`, async () => {
      const { client, service } = createService();
      client.verify2.nextWorkflow.mockImplementation(() =>
        Promise.reject(httpError(409, { title: 'Conflict' })),
      );

      await expect(service.moveVerificationToSms('req-1')).rejects.toMatchObject({
        name: 'VonageRequestError',
        status: 409,
      });
      expect(client.verify2.nextWorkflow).toHaveBeenCalledTimes(NEXT_WORKFLOW_ATTEMPTS);
    });

    it('is expired when Vonage no longer has the request', async () => {
      const { client, service } = createService();
      client.verify2.nextWorkflow.mockRejectedValue(httpError(404, { title: 'Not Found' }));

      await expect(service.moveVerificationToSms('req-1')).resolves.toBe('expired');
    });
  });

  describe('checkVerification', () => {
    it('is verified when Vonage completes the request', async () => {
      const { client, service } = createService();

      await expect(service.checkVerification('req-1', '1234')).resolves.toEqual({
        status: 'verified',
      });
      expect(client.verify2.checkCode).toHaveBeenCalledWith('req-1', '1234');
    });

    it('is a wrong code for any other status', async () => {
      const { client, service } = createService();
      client.verify2.checkCode.mockResolvedValue('failed');

      await expect(service.checkVerification('req-1', '1234')).resolves.toEqual({
        status: 'wrong_code',
      });
    });

    it.each([
      [404, 'Not Found', 'expired'],
      [410, 'Gone', 'too_many_attempts'],
      [429, 'Rate Limit Hit', 'blocked'],
    ])('maps a %i from Vonage to %s', async (status, title, outcome) => {
      const { client, service } = createService();
      client.verify2.checkCode.mockRejectedValue(httpError(status, { title }));

      await expect(service.checkVerification('req-1', '1234')).resolves.toEqual({
        status: outcome,
      });
    });
  });

  describe('errors', () => {
    it('maps an HTTP error to a VonageRequestError with its status and title', async () => {
      const { client, service } = createService();
      client.voice.createOutboundCall.mockRejectedValue(
        httpError(401, {
          title: 'Unauthorized',
          type: 'https://developer.vonage.com/api-errors#unauthorized',
        }),
      );

      const error = await service.createCall(DRIVER_PHONE, NCCO).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VonageRequestError);
      expect(error).toMatchObject({ operation: 'createCall', status: 401, reason: 'Unauthorized' });
      expect(String((error as Error).message)).toBe(
        'Vonage rejected "createCall" (status 401, Unauthorized)',
      );
    });

    it('maps a rejected SMS to a VonageRequestError with the Messages API title', async () => {
      const { client, service } = createService();
      client.messages.send.mockRejectedValue(
        httpError(422, {
          title: 'Invalid params',
          type: 'https://developer.vonage.com/api-errors/messages#1150',
        }),
      );

      await expect(service.sendSms(DRIVER_PHONE, 'Hola')).rejects.toMatchObject({
        name: 'VonageRequestError',
        operation: 'sendSms',
        status: 422,
        reason: 'Invalid params',
      });
    });

    it('maps an aborted request to a VonageTimeoutError', async () => {
      const { client, service } = createService();
      client.verify2.newRequest.mockRejectedValue(abortError());

      const error = await service.startVerification(DRIVER_PHONE, 'en').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VonageTimeoutError);
      expect(error).toMatchObject({ operation: 'startVerification', timeoutMs: 50 });
    });

    it('maps an unknown failure, such as a network error, to a VonageRequestError', async () => {
      const { client, service } = createService();
      client.voice.transferCallWithNCCO.mockRejectedValue(new TypeError('fetch failed'));

      await expect(service.transferCall('call-1', NCCO)).rejects.toThrow(
        new VonageRequestError('transferCall'),
      );
    });

    it('does not keep the SDK error, which holds the request and its credentials', async () => {
      const { client, service } = createService();
      client.messages.send.mockRejectedValue(httpError(500, { title: 'Internal Error' }));

      const error = await service.sendSms(DRIVER_PHONE, 'Hola').catch((e: unknown) => e);

      expect(error).not.toHaveProperty('cause');
      expect(JSON.stringify(error)).not.toContain(API_SECRET);
      expect(String(error)).not.toContain(API_SECRET);
    });

    it('returns a wrong code instead of failing', async () => {
      const { client, service } = createService();
      client.verify2.checkCode.mockRejectedValue(
        httpError(400, {
          title: 'Invalid Code',
          type: 'https://www.developer.vonage.com/api-errors/verify#invalid-code',
        }),
      );

      await expect(service.checkVerification('req-1', '0000')).resolves.toEqual({
        status: 'wrong_code',
      });
    });

    it('still fails a verification check for any other error', async () => {
      const { client, service } = createService();
      client.verify2.checkCode.mockRejectedValue(httpError(500, { title: 'Internal Error' }));

      await expect(service.checkVerification('req-1', '1234')).rejects.toMatchObject({
        name: 'VonageRequestError',
        status: 500,
      });
    });
  });

  describe('logs', () => {
    it('logs a success with the phone number masked', async () => {
      const { service } = createService();

      await service.sendSms(DRIVER_PHONE, 'Hola');

      expect(log).toHaveBeenCalledWith('sendSms to +34******009 succeeded');
    });

    it('logs a failure with the phone number masked and without secrets', async () => {
      const { client, service } = createService();
      client.messages.send.mockRejectedValue(httpError(401, { title: 'Unauthorized' }));

      await service.sendSms(DRIVER_PHONE, 'Hola').catch(() => undefined);

      expect(warn).toHaveBeenCalledWith(
        'Vonage rejected "sendSms" (status 401, Unauthorized) for +34******009',
      );
    });

    it('never logs the full phone number, the text or a secret', async () => {
      const { client, service } = createService();
      client.messages.send.mockRejectedValueOnce(httpError(401, { title: 'Unauthorized' }));
      client.voice.createOutboundCall.mockRejectedValueOnce(abortError());

      await service.sendSms(DRIVER_PHONE, 'Texto privado').catch(() => undefined);
      await service.createCall(DRIVER_PHONE, NCCO).catch(() => undefined);
      await service.startVerification(DRIVER_PHONE, 'es');

      const lines = loggedLines();
      expect(lines).not.toContain(DRIVER_PHONE);
      expect(lines).not.toContain('34611000009');
      expect(lines).not.toContain('Texto privado');
      expect(lines).not.toContain(API_SECRET);
    });
  });
});

import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SdkVonageService, VERIFY_BRAND } from './sdk-vonage.service.js';
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
    },
  } satisfies VonageClient;
}

const API_SECRET = 'super-secret-value';

function createService() {
  const client = createClient();
  return { client, service: new SdkVonageService(client, VIRTUAL_NUMBER, 50) };
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
        requestId: 'req-1',
      });
      expect(client.verify2.newRequest).toHaveBeenCalledWith({
        brand: VERIFY_BRAND,
        locale: 'es-es',
        workflow: [{ channel: 'sms', to: '34611000009' }],
      });
    });
  });

  describe('checkVerification', () => {
    it('is verified when Vonage completes the request', async () => {
      const { client, service } = createService();

      await expect(service.checkVerification('req-1', '1234')).resolves.toEqual({
        verified: true,
      });
      expect(client.verify2.checkCode).toHaveBeenCalledWith('req-1', '1234');
    });

    it('is not verified for any other status', async () => {
      const { client, service } = createService();
      client.verify2.checkCode.mockResolvedValue('failed');

      await expect(service.checkVerification('req-1', '1234')).resolves.toEqual({
        verified: false,
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

    it('returns not verified for a wrong code instead of failing', async () => {
      const { client, service } = createService();
      client.verify2.checkCode.mockRejectedValue(
        httpError(400, {
          title: 'Invalid Code',
          type: 'https://www.developer.vonage.com/api-errors/verify#invalid-code',
        }),
      );

      await expect(service.checkVerification('req-1', '0000')).resolves.toEqual({
        verified: false,
      });
    });

    it('still fails a verification check for any other error', async () => {
      const { client, service } = createService();
      client.verify2.checkCode.mockRejectedValue(
        httpError(404, {
          title: 'Not Found',
          type: 'https://www.developer.vonage.com/api-errors#not-found',
        }),
      );

      await expect(service.checkVerification('req-1', '1234')).rejects.toMatchObject({
        name: 'VonageRequestError',
        status: 404,
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

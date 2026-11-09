import { describe, expect, it, vi } from 'vitest';

import { SdkVonageService, VERIFY_BRAND } from './sdk-vonage.service.js';

import type { NccoAction } from './ncco.js';
import type { VonageClient } from './vonage.client.js';

const VIRTUAL_NUMBER = '+34600000000';
const DRIVER_PHONE = '+34611000009';
const NCCO: NccoAction[] = [{ action: 'conversation', name: 'inc-1234' }];

function createClient() {
  return {
    sms: { send: vi.fn().mockResolvedValue({ messages: [{ messageId: 'msg-1' }] }) },
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

function createService() {
  const client = createClient();
  return { client, service: new SdkVonageService(client, VIRTUAL_NUMBER) };
}

describe('SdkVonageService', () => {
  describe('sendSms', () => {
    it('sends the text from the virtual number without the leading +', async () => {
      const { client, service } = createService();

      await expect(service.sendSms(DRIVER_PHONE, 'Hola')).resolves.toEqual({ messageId: 'msg-1' });
      expect(client.sms.send).toHaveBeenCalledWith({
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
});

import { Vonage } from '@vonage/server-sdk';

import type { NccoAction } from './ncco.js';
import type { Channels } from '@vonage/verify2';

type PhoneEndpoint = {
  type: 'phone';
  number: string;
};

export interface VonageClient {
  sms: {
    send(params: { to: string; from: string; text: string }): Promise<{
      messages: { messageId?: string }[];
    }>;
  };
  voice: {
    createOutboundCall(call: {
      to: PhoneEndpoint[];
      from: PhoneEndpoint;
      ncco: NccoAction[];
    }): Promise<{ uuid: string }>;
    transferCallWithNCCO(uuid: string, ncco: NccoAction[]): Promise<void>;
  };
  verify2: {
    newRequest(params: {
      brand: string;
      locale: string;
      workflow: { channel: Channels.SMS; to: string }[];
    }): Promise<{ requestId: string }>;
    checkCode(requestId: string, code: string): Promise<string>;
  };
}

export interface VonageCredentials {
  apiKey: string;
  apiSecret: string;
  applicationId: string;
  privateKey: string;
}

export const VONAGE_TIMEOUT_MS = 10_000;

export function createVonageClient(credentials: VonageCredentials): VonageClient {
  return new Vonage(credentials, { timeout: VONAGE_TIMEOUT_MS });
}

import { Channels } from '@vonage/verify2';

import { toVerifyLocale } from './locales.js';

import type { NccoAction } from './ncco.js';
import type { VonageClient } from './vonage.client.js';
import type {
  CreatedCall,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from './vonage.service.js';
import type { Locale } from '@csl/shared-types';

export const VERIFY_BRAND = 'CSL Support';

const VERIFICATION_COMPLETED = 'completed';

function toVonageNumber(phone: string): string {
  return phone.replace(/^\+/, '');
}

export class SdkVonageService implements VonageService {
  constructor(
    private readonly client: VonageClient,
    private readonly virtualNumber: string,
  ) {}

  async sendSms(to: string, text: string): Promise<SentSms> {
    const { messages } = await this.client.sms.send({
      to: toVonageNumber(to),
      from: toVonageNumber(this.virtualNumber),
      text,
    });

    return { messageId: messages[0]?.messageId ?? '' };
  }

  async createCall(to: string, ncco: NccoAction[]): Promise<CreatedCall> {
    const { uuid } = await this.client.voice.createOutboundCall({
      to: [{ type: 'phone', number: toVonageNumber(to) }],
      from: { type: 'phone', number: toVonageNumber(this.virtualNumber) },
      ncco,
    });

    return { callId: uuid };
  }

  async transferCall(callId: string, ncco: NccoAction[]): Promise<void> {
    await this.client.voice.transferCallWithNCCO(callId, ncco);
  }

  async startVerification(phone: string, locale: Locale): Promise<StartedVerification> {
    const { requestId } = await this.client.verify2.newRequest({
      brand: VERIFY_BRAND,
      locale: toVerifyLocale(locale),
      workflow: [{ channel: Channels.SMS, to: toVonageNumber(phone) }],
    });

    return { requestId };
  }

  async checkVerification(requestId: string, code: string): Promise<VerificationCheck> {
    const status = await this.client.verify2.checkCode(requestId, code);

    return { verified: status === VERIFICATION_COMPLETED };
  }
}

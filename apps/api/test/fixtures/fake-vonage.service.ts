import type { NccoAction } from '../../src/vonage/ncco.js';
import type {
  CreatedCall,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from '../../src/vonage/vonage.service.js';
import type { Locale } from '@csl/shared-types';

export const FAKE_VERIFICATION_CODE = '1234';

export type RecordedVonageCall =
  | { operation: 'sendSms'; to: string; text: string }
  | { operation: 'createCall'; to: string; ncco: NccoAction[] }
  | { operation: 'transferCall'; callId: string; ncco: NccoAction[] }
  | { operation: 'startVerification'; phone: string; locale: Locale }
  | { operation: 'checkVerification'; requestId: string; code: string };

export class FakeVonageService implements VonageService {
  readonly calls: RecordedVonageCall[] = [];

  async sendSms(to: string, text: string): Promise<SentSms> {
    this.calls.push({ operation: 'sendSms', to, text });
    return { messageId: `fake-sms-${this.calls.length}` };
  }

  async createCall(to: string, ncco: NccoAction[]): Promise<CreatedCall> {
    this.calls.push({ operation: 'createCall', to, ncco });
    return { callId: `fake-call-${this.calls.length}` };
  }

  async transferCall(callId: string, ncco: NccoAction[]): Promise<void> {
    this.calls.push({ operation: 'transferCall', callId, ncco });
  }

  async startVerification(phone: string, locale: Locale): Promise<StartedVerification> {
    this.calls.push({ operation: 'startVerification', phone, locale });
    return { requestId: `fake-verification-${this.calls.length}` };
  }

  async checkVerification(requestId: string, code: string): Promise<VerificationCheck> {
    this.calls.push({ operation: 'checkVerification', requestId, code });
    return { verified: code === FAKE_VERIFICATION_CODE };
  }

  callsTo<T extends RecordedVonageCall['operation']>(
    operation: T,
  ): Extract<RecordedVonageCall, { operation: T }>[] {
    return this.calls.filter(
      (call): call is Extract<RecordedVonageCall, { operation: T }> => call.operation === operation,
    );
  }

  reset(): void {
    this.calls.length = 0;
  }
}

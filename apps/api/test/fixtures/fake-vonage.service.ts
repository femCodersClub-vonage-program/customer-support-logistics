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

type Operation = RecordedVonageCall['operation'];

export class FakeVonageService implements VonageService {
  readonly calls: RecordedVonageCall[] = [];

  private readonly failures = new Map<Operation, Error>();

  async sendSms(to: string, text: string): Promise<SentSms> {
    this.record({ operation: 'sendSms', to, text });
    return { messageId: `fake-sms-${this.calls.length}` };
  }

  async createCall(to: string, ncco: NccoAction[]): Promise<CreatedCall> {
    this.record({ operation: 'createCall', to, ncco });
    return { callId: `fake-call-${this.calls.length}` };
  }

  async transferCall(callId: string, ncco: NccoAction[]): Promise<void> {
    this.record({ operation: 'transferCall', callId, ncco });
  }

  async startVerification(phone: string, locale: Locale): Promise<StartedVerification> {
    this.record({ operation: 'startVerification', phone, locale });
    return { requestId: `fake-verification-${this.calls.length}` };
  }

  async checkVerification(requestId: string, code: string): Promise<VerificationCheck> {
    this.record({ operation: 'checkVerification', requestId, code });
    return { verified: code === FAKE_VERIFICATION_CODE };
  }

  failNext(operation: Operation, error: Error): void {
    this.failures.set(operation, error);
  }

  callsTo<T extends Operation>(operation: T): Extract<RecordedVonageCall, { operation: T }>[] {
    return this.calls.filter(
      (call): call is Extract<RecordedVonageCall, { operation: T }> => call.operation === operation,
    );
  }

  reset(): void {
    this.calls.length = 0;
    this.failures.clear();
  }

  private record(call: RecordedVonageCall): void {
    this.calls.push(call);

    const failure = this.failures.get(call.operation);

    if (failure !== undefined) {
      this.failures.delete(call.operation);
      throw failure;
    }
  }
}

import { CLIENT_TOKEN_TTL_SECONDS } from '../../src/vonage/client-token.js';

import type { ClientToken } from '../../src/vonage/client-token.js';
import type { NccoAction } from '../../src/vonage/ncco.js';
import type {
  CreatedCall,
  NextVerificationChannel,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from '../../src/vonage/vonage.service.js';
import type { Locale } from '@csl/shared-types';

export const FAKE_VERIFICATION_CODE = '1234';

export const FAKE_CHECK_URL = 'https://verify.fake/silent-auth';

export type RecordedVonageCall =
  | { operation: 'sendSms'; to: string; text: string }
  | { operation: 'createCall'; to: string; ncco: NccoAction[] }
  | { operation: 'transferCall'; callId: string; ncco: NccoAction[] }
  | { operation: 'hangupCall'; callId: string }
  | {
      operation: 'startVerification';
      phone: string;
      locale: Locale;
      silentAuthRedirectUrl?: string;
    }
  | { operation: 'checkVerification'; requestId: string; code: string }
  | { operation: 'moveVerificationToSms'; requestId: string }
  | { operation: 'ensureUser'; name: string }
  | { operation: 'createClientToken'; userName: string };

type Operation = RecordedVonageCall['operation'];

export class FakeVonageService implements VonageService {
  readonly calls: RecordedVonageCall[] = [];

  private readonly failures = new Map<Operation, Error>();

  private blockNextVerification = false;

  private nextCheckOutcome: VerificationCheck['status'] | undefined;

  private nextMoveOutcome: NextVerificationChannel | undefined;

  private skipSilentAuthNext = false;

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

  async hangupCall(callId: string): Promise<void> {
    this.record({ operation: 'hangupCall', callId });
  }

  async startVerification(
    phone: string,
    locale: Locale,
    silentAuthRedirectUrl?: string,
  ): Promise<StartedVerification> {
    this.record(
      silentAuthRedirectUrl === undefined
        ? { operation: 'startVerification', phone, locale }
        : { operation: 'startVerification', phone, locale, silentAuthRedirectUrl },
    );

    if (this.blockNextVerification) {
      this.blockNextVerification = false;
      return { status: 'blocked' };
    }

    const requestId = `fake-verification-${this.calls.length}`;
    const withoutSilentAuth = this.skipSilentAuthNext;
    this.skipSilentAuthNext = false;

    return silentAuthRedirectUrl === undefined || withoutSilentAuth
      ? { status: 'started', requestId }
      : { status: 'started', requestId, checkUrl: `${FAKE_CHECK_URL}/${requestId}` };
  }

  async moveVerificationToSms(requestId: string): Promise<NextVerificationChannel> {
    this.record({ operation: 'moveVerificationToSms', requestId });

    const outcome = this.nextMoveOutcome;
    this.nextMoveOutcome = undefined;

    return outcome ?? 'moved';
  }

  async checkVerification(requestId: string, code: string): Promise<VerificationCheck> {
    this.record({ operation: 'checkVerification', requestId, code });

    const outcome = this.nextCheckOutcome;
    this.nextCheckOutcome = undefined;

    return { status: outcome ?? (code === FAKE_VERIFICATION_CODE ? 'verified' : 'wrong_code') };
  }

  async ensureUser(name: string): Promise<void> {
    this.record({ operation: 'ensureUser', name });
  }

  async createClientToken(userName: string): Promise<ClientToken> {
    this.record({ operation: 'createClientToken', userName });

    return {
      token: `fake-client-token-${userName}`,
      expiresAt: new Date(Date.now() + CLIENT_TOKEN_TTL_SECONDS * 1000),
    };
  }

  failNext(operation: Operation, error: Error): void {
    this.failures.set(operation, error);
  }

  blockNextStart(): void {
    this.blockNextVerification = true;
  }

  answerNextCheck(outcome: VerificationCheck['status']): void {
    this.nextCheckOutcome = outcome;
  }

  answerNextMoveToSms(outcome: NextVerificationChannel): void {
    this.nextMoveOutcome = outcome;
  }

  startWithoutSilentAuthNext(): void {
    this.skipSilentAuthNext = true;
  }

  callsTo<T extends Operation>(operation: T): Extract<RecordedVonageCall, { operation: T }>[] {
    return this.calls.filter(
      (call): call is Extract<RecordedVonageCall, { operation: T }> => call.operation === operation,
    );
  }

  reset(): void {
    this.calls.length = 0;
    this.failures.clear();
    this.blockNextVerification = false;
    this.nextCheckOutcome = undefined;
    this.nextMoveOutcome = undefined;
    this.skipSilentAuthNext = false;
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

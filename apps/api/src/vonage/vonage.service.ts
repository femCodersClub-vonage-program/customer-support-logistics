import type { NccoAction } from './ncco.js';
import type { Locale } from '@csl/shared-types';

export const VONAGE_SERVICE = Symbol('VONAGE_SERVICE');

export interface SentSms {
  messageId: string;
}

export interface CreatedCall {
  callId: string;
}

export interface StartedVerification {
  requestId: string;
}

export interface VerificationCheck {
  verified: boolean;
}

export interface VonageService {
  sendSms(to: string, text: string): Promise<SentSms>;
  createCall(to: string, ncco: NccoAction[]): Promise<CreatedCall>;
  transferCall(callId: string, ncco: NccoAction[]): Promise<void>;
  startVerification(phone: string, locale: Locale): Promise<StartedVerification>;
  checkVerification(requestId: string, code: string): Promise<VerificationCheck>;
}

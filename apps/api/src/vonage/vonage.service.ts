import type { ClientToken } from './client-token.js';
import type { NccoAction } from './ncco.js';
import type { Locale } from '@csl/shared-types';

export const VONAGE_SERVICE = Symbol('VONAGE_SERVICE');

export const VERIFICATION_TTL_SECONDS = 10 * 60;

export const VERIFICATION_MAX_WRONG_CODES = 3;

export interface SentSms {
  messageId: string;
}

export interface CreatedCall {
  callId: string;
}

export type StartedVerification =
  { status: 'started'; requestId: string; checkUrl?: string } | { status: 'blocked' };

export type NextVerificationChannel = 'moved' | 'expired';

export interface VerificationCheck {
  status: 'verified' | 'wrong_code' | 'expired' | 'too_many_attempts' | 'blocked';
}

export interface VonageService {
  sendSms(to: string, text: string): Promise<SentSms>;
  createCall(to: string, ncco: NccoAction[]): Promise<CreatedCall>;
  transferCall(callId: string, ncco: NccoAction[]): Promise<void>;
  hangupCall(callId: string): Promise<void>;
  startVerification(
    phone: string,
    locale: Locale,
    silentAuthRedirectUrl?: string,
  ): Promise<StartedVerification>;
  checkVerification(requestId: string, code: string): Promise<VerificationCheck>;
  moveVerificationToSms(requestId: string): Promise<NextVerificationChannel>;
  ensureUser(name: string): Promise<void>;
  createClientToken(userName: string): Promise<ClientToken>;
}

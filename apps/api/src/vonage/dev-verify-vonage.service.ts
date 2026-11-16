import { randomUUID } from 'node:crypto';

import { DisabledVonageService } from './disabled-vonage.service.js';

import type {
  CreatedCall,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from './vonage.service.js';

export class DevVerifyVonageService implements VonageService {
  private readonly disabled = new DisabledVonageService();

  constructor(private readonly code: string) {}

  sendSms(): Promise<SentSms> {
    return this.disabled.sendSms();
  }

  createCall(): Promise<CreatedCall> {
    return this.disabled.createCall();
  }

  transferCall(): Promise<void> {
    return this.disabled.transferCall();
  }

  async startVerification(): Promise<StartedVerification> {
    return { status: 'started', requestId: randomUUID() };
  }

  async checkVerification(_requestId: string, code: string): Promise<VerificationCheck> {
    return { status: code === this.code ? 'verified' : 'wrong_code' };
  }
}

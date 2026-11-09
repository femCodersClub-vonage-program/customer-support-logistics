import { VonageDisabledError } from './vonage.errors.js';

import type {
  CreatedCall,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from './vonage.service.js';

export class DisabledVonageService implements VonageService {
  async sendSms(): Promise<SentSms> {
    throw new VonageDisabledError('sendSms');
  }

  async createCall(): Promise<CreatedCall> {
    throw new VonageDisabledError('createCall');
  }

  async transferCall(): Promise<void> {
    throw new VonageDisabledError('transferCall');
  }

  async startVerification(): Promise<StartedVerification> {
    throw new VonageDisabledError('startVerification');
  }

  async checkVerification(): Promise<VerificationCheck> {
    throw new VonageDisabledError('checkVerification');
  }
}

import { Logger } from '@nestjs/common';

import { VonageDisabledError } from './vonage.errors.js';

import type { VonageOperation } from './vonage.errors.js';
import type {
  CreatedCall,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from './vonage.service.js';

export class DisabledVonageService implements VonageService {
  private readonly logger = new Logger(DisabledVonageService.name);

  async sendSms(): Promise<SentSms> {
    throw this.reject('sendSms');
  }

  async createCall(): Promise<CreatedCall> {
    throw this.reject('createCall');
  }

  async transferCall(): Promise<void> {
    throw this.reject('transferCall');
  }

  async startVerification(): Promise<StartedVerification> {
    throw this.reject('startVerification');
  }

  async checkVerification(): Promise<VerificationCheck> {
    throw this.reject('checkVerification');
  }

  private reject(operation: VonageOperation): VonageDisabledError {
    const error = new VonageDisabledError(operation);
    this.logger.warn(error.message);
    return error;
  }
}

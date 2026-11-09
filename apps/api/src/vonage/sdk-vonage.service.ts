import { Logger } from '@nestjs/common';
import { Channels } from '@vonage/verify2';

import { maskPhone } from '../common/logging/mask-phone.js';

import { toVerifyLocale } from './locales.js';
import { VONAGE_TIMEOUT_MS } from './vonage.client.js';
import {
  VonageRequestError,
  VonageTimeoutError,
  isAbortError,
  readVonageErrorDetails,
} from './vonage.errors.js';

import type { NccoAction } from './ncco.js';
import type { VonageClient } from './vonage.client.js';
import type { VonageError, VonageErrorDetails, VonageOperation } from './vonage.errors.js';
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

const INVALID_CODE_TYPE = '#invalid-code';

function toVonageNumber(phone: string): string {
  return phone.replace(/^\+/, '');
}

interface Attempt<T> {
  operation: VonageOperation;
  target: string;
  request: () => Promise<T>;
  recover?: (details: VonageErrorDetails) => T | undefined;
}

export class SdkVonageService implements VonageService {
  private readonly logger = new Logger(SdkVonageService.name);

  constructor(
    private readonly client: VonageClient,
    private readonly virtualNumber: string,
    private readonly timeoutMs = VONAGE_TIMEOUT_MS,
  ) {}

  async sendSms(to: string, text: string): Promise<SentSms> {
    return this.attempt({
      operation: 'sendSms',
      target: maskPhone(to),
      request: async () => {
        const { messages } = await this.client.sms.send({
          to: toVonageNumber(to),
          from: toVonageNumber(this.virtualNumber),
          text,
        });

        return { messageId: messages[0]?.messageId ?? '' };
      },
    });
  }

  async createCall(to: string, ncco: NccoAction[]): Promise<CreatedCall> {
    return this.attempt({
      operation: 'createCall',
      target: maskPhone(to),
      request: async () => {
        const { uuid } = await this.client.voice.createOutboundCall({
          to: [{ type: 'phone', number: toVonageNumber(to) }],
          from: { type: 'phone', number: toVonageNumber(this.virtualNumber) },
          ncco,
        });

        return { callId: uuid };
      },
    });
  }

  async transferCall(callId: string, ncco: NccoAction[]): Promise<void> {
    return this.attempt({
      operation: 'transferCall',
      target: `call ${callId}`,
      request: () => this.client.voice.transferCallWithNCCO(callId, ncco),
    });
  }

  async startVerification(phone: string, locale: Locale): Promise<StartedVerification> {
    return this.attempt({
      operation: 'startVerification',
      target: maskPhone(phone),
      request: async () => {
        const { requestId } = await this.client.verify2.newRequest({
          brand: VERIFY_BRAND,
          locale: toVerifyLocale(locale),
          workflow: [{ channel: Channels.SMS, to: toVonageNumber(phone) }],
        });

        return { requestId };
      },
    });
  }

  async checkVerification(requestId: string, code: string): Promise<VerificationCheck> {
    return this.attempt({
      operation: 'checkVerification',
      target: `request ${requestId}`,
      request: async () => {
        const status = await this.client.verify2.checkCode(requestId, code);
        return { verified: status === VERIFICATION_COMPLETED };
      },
      recover: ({ type }) => (type?.endsWith(INVALID_CODE_TYPE) ? { verified: false } : undefined),
    });
  }

  private async attempt<T>({ operation, target, request, recover }: Attempt<T>): Promise<T> {
    try {
      const result = await request();
      this.logger.log(`${operation} to ${target} succeeded`);
      return result;
    } catch (error) {
      const details = await readVonageErrorDetails(error);
      const recovered = recover?.(details);

      if (recovered !== undefined) {
        this.logger.log(`${operation} to ${target} answered ${details.reason ?? details.type}`);
        return recovered;
      }

      const vonageError = this.toVonageError(operation, error, details);
      this.logger.warn(`${vonageError.message} for ${target}`);
      throw vonageError;
    }
  }

  private toVonageError(
    operation: VonageOperation,
    error: unknown,
    details: VonageErrorDetails,
  ): VonageError {
    if (isAbortError(error)) {
      return new VonageTimeoutError(operation, this.timeoutMs);
    }

    return new VonageRequestError(operation, { status: details.status, reason: details.reason });
  }
}

import { HttpStatus, Logger } from '@nestjs/common';
import { Channels, SilentAuthChannel } from '@vonage/verify2';

import { maskPhone } from '../common/logging/mask-phone.js';

import { toVerifyLocale } from './locales.js';
import { VONAGE_TIMEOUT_MS } from './vonage.client.js';
import {
  VonageRequestError,
  VonageTimeoutError,
  isAbortError,
  readVonageErrorDetails,
} from './vonage.errors.js';
import { VERIFICATION_TTL_SECONDS } from './vonage.service.js';

import type { ClientToken, ClientTokenSigner } from './client-token.js';
import type { NccoAction } from './ncco.js';
import type { VonageClient } from './vonage.client.js';
import type { VonageError, VonageErrorDetails, VonageOperation } from './vonage.errors.js';
import type {
  CreatedCall,
  NextVerificationChannel,
  SentSms,
  StartedVerification,
  VerificationCheck,
  VonageService,
} from './vonage.service.js';
import type { Locale } from '@csl/shared-types';

export const VERIFY_BRAND = 'CSL Support';

export const VERIFY_CODE_LENGTH = 6;

export const NEXT_WORKFLOW_ATTEMPTS = 3;

const NEXT_WORKFLOW_RETRY_MS = 1000;

const NETWORK_NOT_SUPPORTED = Symbol('network not supported');

const TRY_AGAIN = Symbol('try again');

type VerifyWorkflowStep = Parameters<VonageClient['verify2']['newRequest']>[0]['workflow'][number];

const VERIFICATION_COMPLETED = 'completed';

const INVALID_CODE_TYPE = '#invalid-code';

const CHECK_OUTCOME_BY_STATUS: Partial<Record<number, VerificationCheck['status']>> = {
  [HttpStatus.NOT_FOUND]: 'expired',
  [HttpStatus.GONE]: 'too_many_attempts',
  [HttpStatus.TOO_MANY_REQUESTS]: 'blocked',
};

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
    private readonly signClientToken: ClientTokenSigner,
    private readonly timeoutMs = VONAGE_TIMEOUT_MS,
    private readonly retryDelayMs = NEXT_WORKFLOW_RETRY_MS,
  ) {}

  async sendSms(to: string, text: string): Promise<SentSms> {
    return this.attempt({
      operation: 'sendSms',
      target: maskPhone(to),
      request: async () => {
        const { messageUUID } = await this.client.messages.send({
          channel: 'sms',
          messageType: 'text',
          to: toVonageNumber(to),
          from: toVonageNumber(this.virtualNumber),
          text,
        });

        return { messageId: messageUUID };
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

  async hangupCall(callId: string): Promise<void> {
    await this.attempt<'hung_up' | 'already_ended'>({
      operation: 'hangupCall',
      target: `call ${callId}`,
      request: async () => {
        await this.client.voice.hangupCall(callId);
        return 'hung_up';
      },
      recover: ({ status }) => (status === HttpStatus.NOT_FOUND ? 'already_ended' : undefined),
    });
  }

  async startVerification(
    phone: string,
    locale: Locale,
    silentAuthRedirectUrl?: string,
  ): Promise<StartedVerification> {
    const to = toVonageNumber(phone);
    const sms: VerifyWorkflowStep = { channel: Channels.SMS, to };

    if (silentAuthRedirectUrl !== undefined) {
      const silent = await this.newVerification(phone, locale, [
        { channel: SilentAuthChannel.SILENT_AUTH, to, redirectUrl: silentAuthRedirectUrl },
        sms,
      ]);

      if (silent !== NETWORK_NOT_SUPPORTED) {
        return silent;
      }
    }

    const started = await this.newVerification(phone, locale, [sms]);

    if (started === NETWORK_NOT_SUPPORTED) {
      throw new VonageRequestError('startVerification', { status: HttpStatus.PRECONDITION_FAILED });
    }

    return started;
  }

  async moveVerificationToSms(requestId: string): Promise<NextVerificationChannel> {
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.attempt<NextVerificationChannel | typeof TRY_AGAIN>({
        operation: 'moveVerificationToSms',
        target: `request ${requestId}`,
        request: async () => {
          await this.client.verify2.nextWorkflow(requestId);
          return 'moved';
        },
        recover: ({ status }) => {
          if (status === HttpStatus.CONFLICT && attempt < NEXT_WORKFLOW_ATTEMPTS) {
            return TRY_AGAIN;
          }

          return status === HttpStatus.NOT_FOUND || status === HttpStatus.GONE
            ? 'expired'
            : undefined;
        },
      });

      if (outcome !== TRY_AGAIN) {
        return outcome;
      }

      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    }
  }

  private newVerification(
    phone: string,
    locale: Locale,
    workflow: VerifyWorkflowStep[],
  ): Promise<StartedVerification | typeof NETWORK_NOT_SUPPORTED> {
    return this.attempt<StartedVerification | typeof NETWORK_NOT_SUPPORTED>({
      operation: 'startVerification',
      target: maskPhone(phone),
      request: async () => {
        const { requestId, checkUrl } = await this.client.verify2.newRequest({
          brand: VERIFY_BRAND,
          locale: toVerifyLocale(locale),
          codeLength: VERIFY_CODE_LENGTH,
          channelTimeout: VERIFICATION_TTL_SECONDS,
          workflow,
        });

        return checkUrl === undefined
          ? { status: 'started', requestId }
          : { status: 'started', requestId, checkUrl };
      },
      recover: ({ status }) => {
        if (status === HttpStatus.PRECONDITION_FAILED) {
          return NETWORK_NOT_SUPPORTED;
        }

        return status === HttpStatus.CONFLICT || status === HttpStatus.TOO_MANY_REQUESTS
          ? { status: 'blocked' }
          : undefined;
      },
    });
  }

  async checkVerification(requestId: string, code: string): Promise<VerificationCheck> {
    return this.attempt<VerificationCheck>({
      operation: 'checkVerification',
      target: `request ${requestId}`,
      request: async () => {
        const status = await this.client.verify2.checkCode(requestId, code);
        return { status: status === VERIFICATION_COMPLETED ? 'verified' : 'wrong_code' };
      },
      recover: ({ status, type }) => {
        if (type?.endsWith(INVALID_CODE_TYPE)) {
          return { status: 'wrong_code' };
        }

        const outcome = status === undefined ? undefined : CHECK_OUTCOME_BY_STATUS[status];

        return outcome ? { status: outcome } : undefined;
      },
    });
  }

  async ensureUser(name: string): Promise<void> {
    await this.attempt<'created' | 'existing'>({
      operation: 'ensureUser',
      target: `user ${name}`,
      request: async () => {
        await this.client.users.createUser({ name });
        return 'created';
      },
      recover: ({ status }) => (status === HttpStatus.CONFLICT ? 'existing' : undefined),
    });
  }

  async createClientToken(userName: string): Promise<ClientToken> {
    return this.signClientToken(userName);
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

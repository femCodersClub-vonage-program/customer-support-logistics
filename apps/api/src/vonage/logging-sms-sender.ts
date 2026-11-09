import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { maskPhone } from '../common/privacy/mask-phone.js';

import type { SentSms, SmsSender } from './sms-sender.js';

@Injectable()
export class LoggingSmsSender implements SmsSender {
  private readonly logger = new Logger(LoggingSmsSender.name);

  sendSms(to: string, text: string): Promise<SentSms> {
    const messageId = `unsent-${randomUUID()}`;

    this.logger.warn(
      `SMS ${messageId} to ${maskPhone(to)} not sent, Vonage is not wired yet: ${text}`,
    );

    return Promise.resolve({ messageId });
  }
}

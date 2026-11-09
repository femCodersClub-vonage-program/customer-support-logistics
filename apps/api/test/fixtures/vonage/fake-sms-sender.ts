import type { SentSms, SmsSender } from '../../../src/vonage/sms-sender.js';

export interface RecordedSms {
  to: string;
  text: string;
  messageId: string;
}

export class FakeSmsSender implements SmsSender {
  readonly sent: RecordedSms[] = [];

  sendSms(to: string, text: string): Promise<SentSms> {
    const messageId = `fake-sms-${this.sent.length + 1}`;

    this.sent.push({ to, text, messageId });

    return Promise.resolve({ messageId });
  }

  reset(): void {
    this.sent.length = 0;
  }
}

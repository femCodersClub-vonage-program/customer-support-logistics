export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SentSms {
  messageId: string;
}

export interface SmsSender {
  sendSms(to: string, text: string): Promise<SentSms>;
}

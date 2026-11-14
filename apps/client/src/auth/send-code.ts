import { api } from '../api.ts';

import { goTo, isOnWifi } from './browser.ts';
import { savePendingLogin } from './pending-login.ts';

export type SentCode = 'by-sms' | 'redirecting';

export async function sendCode(
  phone: string,
  { trySilentAuthThenGoTo }: { trySilentAuthThenGoTo?: string } = {},
): Promise<SentCode> {
  const started = await api.startCustomerLogin({ phone });

  if (started.channel === 'sms') {
    return 'by-sms';
  }

  if (trySilentAuthThenGoTo === undefined || isOnWifi()) {
    await api.moveCustomerLoginToSms();
    return 'by-sms';
  }

  savePendingLogin({ phone, next: trySilentAuthThenGoTo });
  goTo(started.checkUrl);

  return 'redirecting';
}

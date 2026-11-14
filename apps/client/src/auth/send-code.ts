import { api } from '../api.ts';

export async function sendCode(phone: string): Promise<void> {
  const started = await api.startCustomerLogin({ phone });

  if (started.channel === 'silent_auth') {
    await api.moveCustomerLoginToSms();
  }
}

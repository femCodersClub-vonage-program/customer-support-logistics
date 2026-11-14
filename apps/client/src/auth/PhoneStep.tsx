import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { ErrorMessage } from './ErrorMessage.tsx';
import { toLoginError } from './login-error.ts';
import { COUNTRIES, toE164 } from './phone.ts';
import { sendCode } from './send-code.ts';

import type { LoginError } from './login-error.ts';
import type { CountryId } from './phone.ts';
import type { FormEvent } from 'react';

interface PhoneStepProps {
  next: string;
  onSent: (phone: string) => void;
}

export function PhoneStep({ next, onSent }: PhoneStepProps) {
  const t = useTranslations('login');
  const errorId = useId();
  const [country, setCountry] = useState<CountryId>('ES');
  const [number, setNumber] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = toE164(country, number);

    if (phone === null) {
      setError('invalidPhone');
      return;
    }

    setSending(true);
    setError(null);

    try {
      if ((await sendCode(phone, { trySilentAuthThenGoTo: next })) === 'by-sms') {
        onSent(phone);
      }
    } catch (reason) {
      setError(toLoginError(reason));
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <p>{t('intro')}</p>
      <div className="login-phone">
        <label>
          {t('country')}
          <select
            value={country}
            onChange={(event) => {
              const chosen = COUNTRIES.find(({ id }) => id === event.target.value);

              if (chosen) {
                setCountry(chosen.id);
              }
            }}
            autoComplete="tel-country-code"
          >
            {COUNTRIES.map(({ id }) => (
              <option key={id} value={id}>
                {t(`countries.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('phone')}
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            aria-invalid={error === 'invalidPhone'}
            aria-describedby={errorId}
            required
          />
        </label>
      </div>
      <ErrorMessage id={errorId} error={error} />
      <button type="submit" className="login-primary" disabled={sending}>
        {sending ? t('sending') : t('sendCode')}
      </button>
    </form>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import { api } from '../api.ts';

import { ErrorMessage } from './ErrorMessage.tsx';
import { toLoginError } from './login-error.ts';
import { sendCode } from './send-code.ts';

import type { LoginError } from './login-error.ts';
import type { CurrentUser } from '@csl/contracts';
import type { FormEvent } from 'react';

export const RESEND_AFTER_SECONDS = 180;

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

interface CodeStepProps {
  phone: string;
  onLoggedIn: (user: CurrentUser) => void;
  onChangeNumber: () => void;
}

export function CodeStep({ phone, onLoggedIn, onChangeNumber }: CodeStepProps) {
  const t = useTranslations('login');
  const errorId = useId();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    codeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) {
      return undefined;
    }

    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);

    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      onLoggedIn(await api.checkCustomerLogin({ code: code.trim() }));
    } catch (reason) {
      setError(toLoginError(reason));
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);

    try {
      await sendCode(phone);
      setCode('');
      setSecondsLeft(RESEND_AFTER_SECONDS);
      codeInputRef.current?.focus();
    } catch (reason) {
      setError(toLoginError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2>{t('codeTitle')}</h2>
      <p>{t('codeSent', { phone })}</p>
      <label>
        {t('code')}
        <input
          ref={codeInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error === 'wrongCode'}
          aria-describedby={errorId}
          required
        />
      </label>
      <ErrorMessage id={errorId} error={error} />
      <button type="submit" className="login-primary" disabled={busy || code.trim() === ''}>
        {busy ? t('checking') : t('logIn')}
      </button>
      <div className="login-actions">
        <button
          type="button"
          className="login-secondary"
          onClick={resend}
          disabled={busy || secondsLeft > 0}
        >
          {t('resend')}
        </button>
        <button type="button" className="login-secondary" onClick={onChangeNumber}>
          {t('changeNumber')}
        </button>
      </div>
      {secondsLeft > 0 && <p>{t('resendIn', { time: formatTime(secondsLeft) })}</p>}
    </form>
  );
}

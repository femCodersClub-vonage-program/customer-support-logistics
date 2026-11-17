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
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_AFTER_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const waiting = secondsLeft > 0;

  useEffect(() => {
    codeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [waiting]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      onLoggedIn(await api.checkCustomerLogin({ code: code.trim() }));
    } catch (reason) {
      const loginError = toLoginError(reason, 'wrongCode');
      setError(loginError);
      setBusy(false);

      if (loginError === 'expired' || loginError === 'tooManyAttempts') {
        setResendAt(Date.now());
        setNow(Date.now());
      }
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);

    try {
      await sendCode(phone);
      setCode('');
      setResendAt(Date.now() + RESEND_AFTER_SECONDS * 1000);
      setNow(Date.now());
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
          disabled={busy || waiting}
        >
          {t('resend')}
        </button>
        <button type="button" className="login-secondary" onClick={onChangeNumber}>
          {t('changeNumber')}
        </button>
      </div>
      {waiting && <p>{t('resendIn', { time: formatTime(secondsLeft) })}</p>}
    </form>
  );
}

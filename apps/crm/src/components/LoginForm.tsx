'use client';

import { ApiError } from '@csl/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { api } from '../lib/api';

import styles from './LoginForm.module.css';

import type { FormEvent } from 'react';

type LoginError = 'invalidCredentials' | 'wait' | 'offline' | 'generic';

function toLoginError(error: unknown): LoginError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === 'VALIDATION_FAILED') {
      return 'invalidCredentials';
    }

    return error.status === 429 ? 'wait' : 'generic';
  }

  const lostConnection =
    error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');

  return lostConnection ? 'offline' : 'generic';
}

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('login');
  const router = useRouter();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);

    try {
      await api.agentLogin({ email, password });
      router.replace(next);
      router.refresh();
    } catch (reason) {
      setError(toLoginError(reason));
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        {t('email')}
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error === 'invalidCredentials'}
          aria-describedby={errorId}
          required
        />
      </label>
      <label className={styles.field}>
        {t('password')}
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error === 'invalidCredentials'}
          aria-describedby={errorId}
          required
        />
      </label>
      <div id={errorId} className={styles.error} role="alert">
        {error !== null && t(`errors.${error}`)}
      </div>
      <button type="submit" className={styles.submit} disabled={sending}>
        {sending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}

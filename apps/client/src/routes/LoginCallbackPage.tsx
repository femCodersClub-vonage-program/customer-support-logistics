import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

import { api } from '../api.ts';
import { toLoginError } from '../auth/login-error.ts';
import { DEFAULT_PATH, safeNextPath } from '../auth/next-path.ts';
import { clearPendingLogin, readPendingLogin } from '../auth/pending-login.ts';
import { useSession } from '../auth/session-context.ts';
import '../auth/login.css';

import type { LoginLocationState } from './LoginPage.tsx';

function silentAuthResult(hash: string): { code: string; requestId: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get('code');
  const requestId = params.get('request_id');

  return code && requestId ? { code, requestId } : null;
}

export function LoginCallbackPage() {
  const t = useTranslations('login');
  const navigate = useNavigate();
  const { logIn } = useSession();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    const pending = readPendingLogin();
    const next = safeNextPath(pending?.next ?? DEFAULT_PATH);
    const result = silentAuthResult(window.location.hash);
    const loginPath = `/login?next=${encodeURIComponent(next)}`;

    const backToLogin = async (state?: LoginLocationState) => {
      clearPendingLogin();
      await navigate(loginPath, { replace: true, state });
    };

    const fallBackToSms = async () => {
      if (pending === null) {
        await backToLogin();
        return;
      }

      try {
        await api.moveCustomerLoginToSms();
        await backToLogin({ smsSentTo: pending.phone });
      } catch (reason) {
        const error = toLoginError(reason);
        await backToLogin({ error: error === 'offline' ? 'offline' : 'expired' });
      }
    };

    const finish = async () => {
      if (result === null) {
        await fallBackToSms();
        return;
      }

      try {
        logIn(await api.checkCustomerLogin(result));
        clearPendingLogin();
        await navigate(next, { replace: true });
      } catch {
        await fallBackToSms();
      }
    };

    void finish();
  }, [logIn, navigate]);

  return (
    <main className="login">
      <h1>{t('title')}</h1>
      <p role="status">{t('verifying')}</p>
    </main>
  );
}

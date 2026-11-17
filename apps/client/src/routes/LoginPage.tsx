import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';

import { CodeStep } from '../auth/CodeStep.tsx';
import { safeNextPath } from '../auth/next-path.ts';
import { PhoneStep } from '../auth/PhoneStep.tsx';
import { useSession } from '../auth/session-context.ts';
import '../auth/login.css';

import type { LoginError } from '../auth/login-error.ts';

export type LoginLocationState = { smsSentTo: string } | { error: LoginError };

function readState(state: unknown): { phone: string | null; error: LoginError | null } {
  if (typeof state !== 'object' || state === null) {
    return { phone: null, error: null };
  }

  return {
    phone: 'smsSentTo' in state && typeof state.smsSentTo === 'string' ? state.smsSentTo : null,
    error:
      'error' in state && (state.error === 'offline' || state.error === 'expired')
        ? state.error
        : null,
  };
}

export function LoginPage() {
  const t = useTranslations('login');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, logIn } = useSession();
  const [initial] = useState(() => readState(location.state));
  const [phone, setPhone] = useState<string | null>(initial.phone);
  const next = safeNextPath(searchParams.get('next'));

  if (state.status === 'ready' && state.user?.role === 'customer') {
    return <Navigate to={next} replace />;
  }

  return (
    <main className="login">
      <h1>{t('title')}</h1>
      {phone === null ? (
        <PhoneStep next={next} initialError={initial.error} onSent={setPhone} />
      ) : (
        <CodeStep
          phone={phone}
          onLoggedIn={(user) => {
            logIn(user);
            void navigate(next, { replace: true });
          }}
          onChangeNumber={() => setPhone(null)}
        />
      )}
    </main>
  );
}

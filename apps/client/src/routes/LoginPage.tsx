import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';

import { CodeStep } from '../auth/CodeStep.tsx';
import { safeNextPath } from '../auth/next-path.ts';
import { PhoneStep } from '../auth/PhoneStep.tsx';
import { useSession } from '../auth/session-context.ts';
import '../auth/login.css';

export interface LoginLocationState {
  smsSentTo: string;
}

function smsSentTo(state: unknown): string | null {
  return typeof state === 'object' &&
    state !== null &&
    'smsSentTo' in state &&
    typeof state.smsSentTo === 'string'
    ? state.smsSentTo
    : null;
}

export function LoginPage() {
  const t = useTranslations('login');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, logIn } = useSession();
  const [phone, setPhone] = useState<string | null>(() => smsSentTo(location.state));
  const next = safeNextPath(searchParams.get('next'));

  if (state.status === 'ready' && state.user?.role === 'customer') {
    return <Navigate to={next} replace />;
  }

  return (
    <main className="login">
      <h1>{t('title')}</h1>
      {phone === null ? (
        <PhoneStep next={next} onSent={setPhone} />
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

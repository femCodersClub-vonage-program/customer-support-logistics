import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';

import { CodeStep } from '../auth/CodeStep.tsx';
import { safeNextPath } from '../auth/next-path.ts';
import { PhoneStep } from '../auth/PhoneStep.tsx';
import { useSession } from '../auth/session-context.ts';
import '../auth/login.css';

export function LoginPage() {
  const t = useTranslations('login');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, logIn } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  const next = safeNextPath(searchParams.get('next'));

  if (state.status === 'ready' && state.user?.role === 'customer') {
    return <Navigate to={next} replace />;
  }

  return (
    <main className="login">
      <h1>{t('title')}</h1>
      {phone === null ? (
        <PhoneStep onSent={setPhone} />
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

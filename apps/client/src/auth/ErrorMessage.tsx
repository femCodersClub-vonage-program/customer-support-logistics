import { useTranslations } from 'use-intl';

import type { LoginError } from './login-error.ts';

export function ErrorMessage({ id, error }: { id: string; error: LoginError | null }) {
  const t = useTranslations('login.errors');

  return (
    <div id={id} className="login-error" role="alert">
      {error !== null && t(error)}
    </div>
  );
}

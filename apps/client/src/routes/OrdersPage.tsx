import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

import { useSession } from '../auth/session-context.ts';
import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

import type { Order } from '@csl/shared-types';

const orders: Order[] = [];

export function OrdersPage() {
  const t = useTranslations('orders');
  const navigate = useNavigate();
  const { logOut } = useSession();

  const logOutAndLeave = async () => {
    await logOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  };

  return (
    <main>
      <h1>{t('title')}</h1>
      {orders.length === 0 && <p>{t('empty')}</p>}
      <button type="button" onClick={logOutAndLeave}>
        {t('logOut')}
      </button>
      <InstallPrompt />
    </main>
  );
}

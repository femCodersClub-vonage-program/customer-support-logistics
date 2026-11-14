import { useTranslations } from 'use-intl';

import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

import type { Order } from '@csl/shared-types';

const orders: Order[] = [];

export function OrdersPage() {
  const t = useTranslations('orders');

  return (
    <main>
      <h1>{t('title')}</h1>
      {orders.length === 0 && <p>{t('empty')}</p>}
      <InstallPrompt />
    </main>
  );
}

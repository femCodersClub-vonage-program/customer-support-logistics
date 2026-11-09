import { useTranslations } from 'use-intl';

import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

import type { Order } from '@csl/shared-types';
import { OrderCard } from '../components/OrderCard.tsx';

const orders: Order[] = [];

export function OrdersPage() {
  const t = useTranslations('orders');

  return (
    <main>
      <h1>{t('title')}</h1>
      {orders.length === 0 && <p>{t('empty')}</p>}

      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}

      <InstallPrompt />
    </main>
  );
}

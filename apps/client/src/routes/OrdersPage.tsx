import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

import type { Order } from '@csl/shared-types';
import { OrderCard } from '../components/OrderCard.tsx';

const orders: Order[] = [
  {
    id: 'ORD-001',
    customerId: 'CUSTOMER-001',
    routeId: null,
    address: 'Barcelona',
    status: 'delivered',
  },
  {
    id: 'ORD-002',
    customerId: 'CUSTOMER-001',
    routeId: null,
    address: 'Mataró',
    status: 'in_transit',
  },
  {
    id: 'ORD-003',
    customerId: 'CUSTOMER-001',
    routeId: null,
    address: 'Girona',
    status: 'failed',
  },
];
const incidentByOrderId: Record<string, string> = {
  'ORD-003': 'INC-001',
};

export function OrdersPage() {
  const t = useTranslations('orders');
  const isLoading = false;
  const [hasError, setHasError] = useState(false);

  return (
    <main className="orders-page">
      <div className="orders-page__container">
        <h1 className="orders-page__title">{t('title')}</h1>

        {isLoading && <p role="status">{t('loading')}</p>}
        {!isLoading && hasError && (
          <div>
            <p role="alert">{t('error')}</p>
            <button type="button" className="order-card__button" onClick={() => setHasError(false)}>
              {t('retry')}
            </button>
          </div>
        )}
        {!isLoading && !hasError && orders.length === 0 && <p>{t('empty')}</p>}

        {!isLoading && !hasError && orders.length > 0 && (
          <section className="orders-page__list" aria-label={t('title')}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} incidentId={incidentByOrderId[order.id]} />
            ))}
          </section>
        )}

        <InstallPrompt />
      </div>
    </main>
  );
}

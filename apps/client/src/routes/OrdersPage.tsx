import { useQuery } from '@tanstack/react-query';
import { Check, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

import { api } from '../api.ts';
import { useSession } from '../auth/session-context.ts';
import '../auth/login.css';
import { OrderCard } from '../components/OrderCard.tsx';
import '../orders/orders.css';
import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

export function OrdersPage() {
  const t = useTranslations('orders');
  const navigate = useNavigate();
  const { state, logOut } = useSession();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: ({ signal }) => api.listOrders({ signal }),
  });

  const orders = data?.items ?? [];
  const customerName = state.status === 'ready' ? (state.user?.name ?? '') : '';

  const logOutAndLeave = async () => {
    await logOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  };

  return (
    <main className="orders-page">
      <div className="orders-page__container">
        {customerName && (
          <div className="orders-page__welcome">
            <p className="orders-page__greeting">{t('greeting', { name: customerName })}</p>
            <span className="orders-page__verified">
              <Check size={14} strokeWidth={2.5} aria-hidden="true" />
              <span>{t('verified')}</span>
            </span>
          </div>
        )}

        <header className="orders-page__header">
          <h1 className="orders-page__title">{t('title')}</h1>
          <button type="button" className="log-out" onClick={logOutAndLeave}>
            <LogOut size={16} strokeWidth={2} aria-hidden="true" />
            {t('logOut')}
          </button>
        </header>

        {isLoading && (
          <div className="orders-page__state">
            <p role="status">{t('loading')}</p>
          </div>
        )}

        {!isLoading && isError && (
          <div className="orders-page__state orders-page__state--error">
            <p role="alert">{t('error')}</p>
            <button type="button" className="orders-page__retry" onClick={() => void refetch()}>
              {t('retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && (
          <div className="orders-page__state">
            <p>{t('empty')}</p>
          </div>
        )}

        {!isLoading && !isError && orders.length > 0 && (
          <section className="orders-page__list" aria-label={t('title')}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </section>
        )}

        <InstallPrompt />
      </div>
    </main>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api.ts';
import { useTranslations } from 'use-intl';

import { useSession } from '../auth/session-context.ts';
import '../auth/login.css';
import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

import { OrderCard } from '../components/OrderCard.tsx';

export function OrdersPage() {
  const t = useTranslations('orders');
  const navigate = useNavigate();
  const { logOut } = useSession();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: ({ signal }) => api.listOrders({ signal }),
  });

  const orders = data?.items ?? [];

  const logOutAndLeave = async () => {
    await logOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  };

  return (
    <main className="orders-page">
      <div className="orders-page__container">
        <h1 className="orders-page__title">{t('title')}</h1>

        {isLoading && <p role="status">{t('loading')}</p>}

        {!isLoading && isError && (
          <div>
            <p role="alert">{t('error')}</p>
            <button type="button" className="order-card__button" onClick={() => void refetch()}>
              {t('retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && <p>{t('empty')}</p>}

        {!isLoading && !isError && orders.length > 0 && (
          <section className="orders-page__list" aria-label={t('title')}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </section>
        )}

        <button type="button" className="log-out" onClick={logOutAndLeave}>
          {t('logOut')}
        </button>

        <InstallPrompt />
      </div>
    </main>
  );
}

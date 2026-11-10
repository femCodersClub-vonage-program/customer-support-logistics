import { useTranslations } from 'use-intl';
import type { Order } from '@csl/shared-types';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Truck } from 'lucide-react';
interface OrderCardProps {
  order: Order;
}
const statusIcons: Record<Order['status'], ReactNode> = {
  pending: '◷',
  in_transit: <Truck size={24} strokeWidth={2} aria-hidden="true" />,
  delivered: '✓',
  failed: '!',
};

export function OrderCard({ order }: OrderCardProps) {
  const t = useTranslations('orders');
  return (
    <article className="order-card">
    <h2 className="order-card__title">{t('order', { id: order.id })}</h2>
      <p className="order-card__details">
        {t('address')}: {order.address}
      </p>
      <p className={`order-card__status order-card__status--${order.status}`}>
  <span  className="order-card__icon" aria-hidden="true">{statusIcons[order.status]}</span>
  <span>{t(`statuses.${order.status}`)}</span>
</p>
<Link to={`/report/${order.id}`} className="order-card__button">
  {t('reportProblem')}
</Link>
  </article>
  );

}
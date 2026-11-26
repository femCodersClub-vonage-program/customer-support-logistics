import { AlertCircle, CheckCircle2, Clock, MapPin, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';

import '../orders/orders.css';

import type { Order } from '@csl/shared-types';
import type { ReactNode } from 'react';

interface OrderCardProps {
  order: Order;
  incidentId?: string;
}

const statusIcons: Record<Order['status'], ReactNode> = {
  pending: <Clock size={15} strokeWidth={2.2} aria-hidden="true" />,
  in_transit: <Truck size={15} strokeWidth={2.2} aria-hidden="true" />,
  delivered: <CheckCircle2 size={15} strokeWidth={2.2} aria-hidden="true" />,
  failed: <AlertCircle size={15} strokeWidth={2.2} aria-hidden="true" />,
};

export function OrderCard({ order, incidentId }: OrderCardProps) {
  const t = useTranslations('orders');

  return (
    <article className="order-card">
      <div className="order-card__header">
        <h2 className="order-card__title">{t('order', { id: order.id })}</h2>
        <p className={`order-card__status order-card__status--${order.status}`}>
          <span className="order-card__icon" aria-hidden="true">
            {statusIcons[order.status]}
          </span>
          <span>{t(`statuses.${order.status}`)}</span>
        </p>
      </div>

      <p className="order-card__details">
        <MapPin size={16} strokeWidth={2} className="order-card__details-icon" aria-hidden="true" />
        <span>
          {t('address')}: {order.address}
        </span>
      </p>

      <div className="order-card__progress" aria-hidden="true">
        <span className={`order-card__progress-bar order-card__progress-bar--${order.status}`} />
      </div>

      <div className="order-card__footer">
        {incidentId ? (
          <Link to={`/incidents/${incidentId}`} className="order-card__button">
            {t('viewIncident')}
          </Link>
        ) : (
          <Link to={`/report/${order.id}`} className="order-card__button">
            {t('reportProblem')}
          </Link>
        )}
      </div>
    </article>
  );
}

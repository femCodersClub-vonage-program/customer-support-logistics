import type { Order } from '@csl/shared-types';

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  return (
    <article>
      <h2>Order {order.id}</h2>
      <p>Address: {order.address}</p>
      <p>Status: {order.status}</p>
    </article>
  );
}
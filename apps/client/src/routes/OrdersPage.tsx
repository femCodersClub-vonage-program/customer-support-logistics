import type { Order } from '@csl/shared-types';
import { OrderCard } from '../components/OrderCard.tsx';

const orders: Order[] = [];

export function OrdersPage() {
  return (
    <main>
      <h1>My orders</h1>
      {orders.length === 0 && <p>You have no orders yet.</p>}

      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </main>
  );
}
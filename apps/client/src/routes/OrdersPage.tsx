import { InstallPrompt } from '../pwa/InstallPrompt.tsx';

import type { Order } from '@csl/shared-types';

const orders: Order[] = [];

export function OrdersPage() {
  return (
    <main>
      <h1>My orders</h1>
      {orders.length === 0 && <p>You have no orders yet.</p>}
      <InstallPrompt />
    </main>
  );
}

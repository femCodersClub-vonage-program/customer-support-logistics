import type { orders } from '../database/schema/index.js';
import type { Order } from '@csl/shared-types';

export type OrderRow = typeof orders.$inferSelect;

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customerId,
    routeId: row.routeId,
    address: row.address,
    status: row.status,
  };
}

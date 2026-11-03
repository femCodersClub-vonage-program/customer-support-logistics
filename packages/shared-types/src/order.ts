export const ORDER_STATUSES = ['pending', 'in_transit', 'delivered', 'failed'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  customerId: string;
  routeId: string | null;
  address: string;
  status: OrderStatus;
}

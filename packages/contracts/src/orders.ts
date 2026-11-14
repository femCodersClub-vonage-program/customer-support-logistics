import { ORDER_STATUSES } from '@csl/shared-types';
import { z } from 'zod';

import { uuidSchema } from './common.js';

import type { Order } from '@csl/shared-types';

export const orderStatusSchema = z.enum(ORDER_STATUSES).meta({ id: 'OrderStatus' });

export const orderSchema = z
  .object({
    id: uuidSchema,
    customerId: uuidSchema,
    routeId: uuidSchema.nullable(),
    address: z.string(),
    status: orderStatusSchema,
  })
  .meta({ id: 'Order' }) satisfies z.ZodType<Order>;

export const listOrdersResponseSchema = z
  .object({ items: z.array(orderSchema) })
  .meta({ id: 'ListOrdersResponse' });

export type ListOrdersResponse = z.infer<typeof listOrdersResponseSchema>;

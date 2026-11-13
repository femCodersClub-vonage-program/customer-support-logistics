import { Controller, Get, Inject } from '@nestjs/common';

import { CurrentActor, Roles } from '../auth/auth.decorators.js';

import { OrdersService } from './orders.service.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type { ListOrdersResponse } from '@csl/contracts';

@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  @Roles('customer')
  list(@CurrentActor() actor: AuthActor): Promise<ListOrdersResponse> {
    return this.orders.listForCustomer(actor.id);
  }
}

import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { CurrentActor } from '../common/dev-auth/current-actor.decorator.js';
import { DevActorGuard } from '../common/dev-auth/dev-actor.guard.js';

import { OrdersService } from './orders.service.js';

import type { DevActor } from '../common/dev-auth/dev-actor.js';
import type { ListOrdersResponse } from '@csl/contracts';

@Controller('orders')
@UseGuards(DevActorGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentActor() actor: DevActor): Promise<ListOrdersResponse> {
    return this.orders.listForActor(actor);
  }
}

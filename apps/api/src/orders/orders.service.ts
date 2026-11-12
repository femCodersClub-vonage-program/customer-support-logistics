import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { requireCustomerId } from '../auth/auth-actor.js';
import { DATABASE } from '../database/database.constants.js';
import { orders } from '../database/schema/index.js';

import { toOrder } from './orders.mapper.js';

import type { AuthActor } from '../auth/auth-actor.js';
import type { Database } from '../database/database.constants.js';
import type { ListOrdersResponse } from '@csl/contracts';

@Injectable()
export class OrdersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForActor(actor: AuthActor): Promise<ListOrdersResponse> {
    const customerId = requireCustomerId(actor);

    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt), desc(orders.id));

    return { items: rows.map(toOrder) };
  }
}

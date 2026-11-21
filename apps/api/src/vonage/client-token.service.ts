import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants.js';
import { incidents, orders } from '../database/schema/index.js';

import { vonageUserName } from './vonage-users.js';
import { VONAGE_SERVICE } from './vonage.service.js';

import type { VonageService } from './vonage.service.js';
import type { AuthActor } from '../auth/auth-actor.js';
import type { Database } from '../database/database.constants.js';
import type { ClientTokenResponse } from '@csl/contracts';

@Injectable()
export class ClientTokenService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
  ) {}

  async create(actor: AuthActor, incidentId: string): Promise<ClientTokenResponse> {
    const [incident] = await this.db
      .select({ status: incidents.status })
      .from(incidents)
      .innerJoin(orders, eq(orders.id, incidents.orderId))
      .where(
        and(
          eq(incidents.id, incidentId),
          actor.role === 'customer' ? eq(orders.customerId, actor.id) : undefined,
        ),
      );

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    if (incident.status !== 'in_mediation') {
      throw new ConflictException('Incident is not in mediation');
    }

    const userName = vonageUserName(actor);

    await this.vonage.ensureUser(userName);
    const { token, expiresAt } = await this.vonage.createClientToken(userName);

    return { token, userName, expiresAt: expiresAt.toISOString() };
  }
}

import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { maskPhone } from '../common/logging/mask-phone.js';
import { DATABASE } from '../database/database.constants.js';
import { customers } from '../database/schema/index.js';
import { VERIFICATION_MAX_WRONG_CODES, VONAGE_SERVICE } from '../vonage/vonage.service.js';

import { CustomerLoginError } from './customer-login.errors.js';
import { PendingVerifications } from './pending-verifications.js';
import { SessionsService } from './sessions.service.js';

import type { CreatedSession } from './sessions.service.js';
import type { Database } from '../database/database.constants.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type { CurrentUser } from '@csl/contracts';

export interface CustomerLogin {
  session: CreatedSession;
  user: CurrentUser;
}

@Injectable()
export class CustomerLoginService {
  private readonly logger = new Logger(CustomerLoginService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(PendingVerifications) private readonly pending: PendingVerifications,
  ) {}

  async start(phone: string): Promise<string> {
    const [customer] = await this.db
      .select({ id: customers.id, locale: customers.locale })
      .from(customers)
      .where(eq(customers.phone, phone))
      .limit(1);

    if (!customer) {
      const requestId = randomUUID();
      this.pending.add(requestId, null);
      this.logger.log(`Customer login started for an unknown phone ${maskPhone(phone)}`);

      return requestId;
    }

    const started = await this.vonage.startVerification(phone, customer.locale);

    if (started.status === 'blocked') {
      this.logger.warn(`Customer login for customer ${customer.id} blocked by Verify`);
      throw new CustomerLoginError('blocked');
    }

    this.pending.add(started.requestId, customer.id);
    this.logger.log(`Customer login started for customer ${customer.id}`);

    return started.requestId;
  }

  async check(
    requestId: string | null,
    code: string,
    previousToken: string | null,
  ): Promise<CustomerLogin> {
    const verification = requestId === null ? undefined : this.pending.find(requestId);

    if (requestId === null || verification === undefined) {
      this.logger.warn('Customer login check without a pending verification');
      throw new CustomerLoginError('expired');
    }

    const { customerId } = verification;

    if (customerId === null) {
      throw this.rejectUnknownPhone(requestId);
    }

    const { status } = await this.vonage.checkVerification(requestId, code);

    if (status !== 'verified') {
      if (status === 'expired' || status === 'too_many_attempts') {
        this.pending.remove(requestId);
      }

      this.logger.warn(`Customer login check for customer ${customerId} failed: ${status}`);
      throw new CustomerLoginError(status);
    }

    this.pending.remove(requestId);

    return this.logIn(customerId, previousToken);
  }

  private rejectUnknownPhone(requestId: string): CustomerLoginError {
    if (this.pending.countCheck(requestId) >= VERIFICATION_MAX_WRONG_CODES) {
      this.pending.remove(requestId);
      this.logger.warn('Customer login check for an unknown phone failed: too_many_attempts');

      return new CustomerLoginError('too_many_attempts');
    }

    this.logger.warn('Customer login check rejected for an unknown phone');

    return new CustomerLoginError('wrong_code');
  }

  private async logIn(customerId: string, previousToken: string | null): Promise<CustomerLogin> {
    const [customer] = await this.db
      .update(customers)
      .set({ phoneVerifiedAt: sql`now()` })
      .where(eq(customers.id, customerId))
      .returning({ id: customers.id, name: customers.name });

    if (!customer) {
      throw new UnauthorizedException('The customer no longer exists');
    }

    if (previousToken) {
      await this.sessions.revoke(previousToken);
    }

    const session = await this.sessions.create({ role: 'customer', id: customer.id });
    this.logger.log(`Customer ${customer.id} logged in`);

    return { session, user: { role: 'customer', id: customer.id, name: customer.name } };
  }
}

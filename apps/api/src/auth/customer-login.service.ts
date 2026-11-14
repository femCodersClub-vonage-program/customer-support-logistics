import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { maskPhone } from '../common/logging/mask-phone.js';
import { DATABASE } from '../database/database.constants.js';
import { customers } from '../database/schema/index.js';
import { VONAGE_SERVICE } from '../vonage/vonage.service.js';

import { CustomerLoginError } from './customer-login.errors.js';
import { PendingVerifications } from './pending-verifications.js';
import { SessionsService } from './sessions.service.js';

import type { PendingVerification } from './pending-verifications.js';
import type { CreatedSession } from './sessions.service.js';
import type { Database } from '../database/database.constants.js';
import type { VonageService } from '../vonage/vonage.service.js';
import type { CurrentUser } from '@csl/contracts';

export const SILENT_AUTH_REDIRECT_URL = Symbol('SILENT_AUTH_REDIRECT_URL');

export interface CustomerLogin {
  session: CreatedSession;
  user: CurrentUser;
}

export interface StartedCustomerLogin {
  requestId: string;
  checkUrl?: string;
}

export interface CustomerLoginCode {
  code: string;
  requestId?: string;
}

@Injectable()
export class CustomerLoginService {
  private readonly logger = new Logger(CustomerLoginService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VONAGE_SERVICE) private readonly vonage: VonageService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(PendingVerifications) private readonly pending: PendingVerifications,
    @Inject(SILENT_AUTH_REDIRECT_URL) private readonly silentAuthRedirectUrl: string | undefined,
  ) {}

  async start(phone: string): Promise<StartedCustomerLogin> {
    const [customer] = await this.db
      .select({ id: customers.id, locale: customers.locale })
      .from(customers)
      .where(eq(customers.phone, phone))
      .limit(1);

    if (!customer) {
      const requestId = randomUUID();
      this.pending.add(requestId, null);
      this.logger.log(`Customer login started for an unknown phone ${maskPhone(phone)}`);

      return { requestId };
    }

    const started = await this.vonage.startVerification(
      phone,
      customer.locale,
      this.silentAuthRedirectUrl,
    );

    if (started.status === 'blocked') {
      this.logger.warn(`Customer login for customer ${customer.id} blocked by Verify`);
      throw new CustomerLoginError('blocked');
    }

    this.pending.add(started.requestId, customer.id, started.checkUrl === undefined);
    this.logger.log(
      `Customer login started for customer ${customer.id} by ${started.checkUrl ? 'silent auth' : 'SMS'}`,
    );

    return started.checkUrl === undefined
      ? { requestId: started.requestId }
      : { requestId: started.requestId, checkUrl: started.checkUrl };
  }

  async moveToSms(cookieRequestId: string | null): Promise<void> {
    const { requestId, customerId, bySms } = this.pendingFor(cookieRequestId);

    if (customerId === null || bySms) {
      return;
    }

    if ((await this.vonage.moveVerificationToSms(requestId)) === 'expired') {
      this.pending.remove(requestId);
      this.logger.warn(`Customer login for customer ${customerId} expired before the SMS`);
      throw new CustomerLoginError('expired');
    }

    this.pending.markBySms(requestId);
    this.logger.log(`Customer login for customer ${customerId} moved to SMS`);
  }

  async check(
    cookieRequestId: string | null,
    { code, requestId: returnedRequestId }: CustomerLoginCode,
    previousToken: string | null,
  ): Promise<CustomerLogin> {
    const { requestId, customerId } = this.pendingFor(cookieRequestId);

    if (returnedRequestId !== undefined && returnedRequestId !== requestId) {
      this.logger.warn('Customer login check rejected: the returned request id does not match');
      throw new CustomerLoginError('wrong_code');
    }

    if (customerId === null) {
      this.logger.warn('Customer login check rejected for an unknown phone');
      throw new CustomerLoginError('wrong_code');
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

  private pendingFor(requestId: string | null): PendingVerification & { requestId: string } {
    const verification = requestId === null ? undefined : this.pending.find(requestId);

    if (requestId === null || verification === undefined) {
      this.logger.warn('Customer login step without a pending verification');
      throw new CustomerLoginError('expired');
    }

    return { ...verification, requestId };
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
